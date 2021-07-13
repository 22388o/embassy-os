use std::collections::HashMap;
use std::future::Future;
use std::net::Ipv4Addr;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::task::Poll;
use std::time::Duration;

use anyhow::anyhow;
use bollard::Docker;
use patch_db::{DbHandle, PatchDbHandle};
use sqlx::{Executor, Sqlite};
use tokio::sync::watch::error::RecvError;
use tokio::sync::watch::{channel, Receiver, Sender};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_stream::wrappers::WatchStream;
use torut::onion::TorSecretKeyV3;

use crate::action::docker::DockerAction;
use crate::context::RpcContext;
use crate::net::interface::InterfaceId;
use crate::net::mdns::MdnsController;
use crate::net::tor::TorController;
use crate::net::NetController;
use crate::s9pk::manifest::{Manifest, PackageId};
use crate::util::Version;
use crate::{Error, ResultExt};

pub struct ManagerMap(RwLock<HashMap<(PackageId, Version), Arc<Manager>>>);
impl ManagerMap {
    pub async fn init<Db: DbHandle, Ex>(
        db: &mut Db,
        secrets: &mut Ex,
        net_ctl: &NetController,
    ) -> Result<Self, Error>
    where
        for<'a> &'a mut Ex: Executor<'a, Database = Sqlite>,
    {
        todo!()
    }

    pub async fn add(
        &self,
        docker: Docker,
        net_ctl: Arc<NetController>,
        manifest: Manifest,
        tor_keys: HashMap<InterfaceId, TorSecretKeyV3>,
    ) -> Result<(), Error> {
        let mut lock = self.0.write().await;
        let id = (manifest.id.clone(), manifest.version.clone());
        if lock.contains_key(&id) {
            return Ok(());
        }
        lock.insert(
            id,
            Arc::new(Manager::create(docker, net_ctl, manifest, tor_keys).await?),
        );
        Ok(())
    }

    pub async fn remove(&self, id: &(PackageId, Version)) {
        self.0.write().await.remove(id);
    }

    pub async fn get(&self, id: &(PackageId, Version)) -> Option<Arc<Manager>> {
        self.0.read().await.get(id).cloned()
    }
}

pub struct Manager {
    on_stop: Sender<OnStop>,
    thread: JoinHandle<()>,
}

#[derive(Clone, Copy)]
pub enum OnStop {
    Restart,
    Sleep,
    Exit,
}

async fn run_main(
    docker: &Docker,
    net_ctl: &NetController,
    manifest: &Manifest,
    tor_keys: &HashMap<InterfaceId, TorSecretKeyV3>,
) -> Result<Result<(), (i32, String)>, Error> {
    let rt_manifest = manifest.clone();
    let mut runtime = tokio::spawn(async move {
        rt_manifest
            .main
            .execute::<(), ()>(
                &rt_manifest.id,
                &rt_manifest.version,
                None,
                &rt_manifest.volumes,
                None,
                false,
            )
            .await
    });
    let mut ip = None::<Ipv4Addr>;
    loop {
        match docker
            .inspect_container(&DockerAction::container_name(&manifest.id, None), None)
            .await
        {
            Ok(res) => {
                ip = res
                    .network_settings
                    .and_then(|ns| ns.networks)
                    .and_then(|mut n| n.remove("start9"))
                    .and_then(|es| es.ip_address)
                    .map(|ip| ip.parse())
                    .transpose()?;
                break;
            }
            Err(bollard::errors::Error::DockerResponseNotFoundError { .. }) => (),
            Err(e) => Err(e)?,
        }
        match futures::poll!(&mut runtime) {
            Poll::Ready(res) => {
                return res
                    .map_err(|e| {
                        Error::new(
                            anyhow!("Manager runtime panicked!"),
                            crate::ErrorKind::Docker,
                        )
                    })
                    .and_then(|a| a)
            }
            _ => (),
        }
    }
    let ip = ip.ok_or_else(|| {
        Error::new(
            anyhow!("inspect did not return ip"),
            crate::ErrorKind::Docker,
        )
    })?;

    net_ctl
        .add(
            &manifest.id,
            ip,
            manifest
                .interfaces
                .0
                .iter()
                .map(|(id, info)| {
                    Ok((
                        id.clone(),
                        info,
                        tor_keys
                            .get(id)
                            .ok_or_else(|| {
                                Error::new(
                                    anyhow!("interface {} missing key", id),
                                    crate::ErrorKind::Tor,
                                )
                            })?
                            .clone(),
                    ))
                })
                .collect::<Result<Vec<_>, Error>>()?,
        )
        .await?;
    let res = runtime
        .await
        .map_err(|e| {
            Error::new(
                anyhow!("Manager runtime panicked!"),
                crate::ErrorKind::Docker,
            )
        })
        .and_then(|a| a);
    net_ctl.remove(&manifest.id, manifest.interfaces.0.keys().cloned());
    res
}

impl Manager {
    async fn create(
        docker: Docker,
        net_ctl: Arc<NetController>,
        manifest: Manifest,
        tor_keys: HashMap<InterfaceId, TorSecretKeyV3>,
    ) -> Result<Self, Error> {
        let (on_stop, mut recv) = channel(OnStop::Sleep);
        let thread = tokio::spawn(async move {
            loop {
                fn handle_stop_action<'a>(
                    recv: &'a mut Receiver<OnStop>,
                ) -> (
                    OnStop,
                    Option<impl Future<Output = Result<(), RecvError>> + 'a>,
                ) {
                    let val = *recv.borrow_and_update();
                    match val {
                        OnStop::Sleep => (OnStop::Sleep, Some(recv.changed())),
                        a => (a, None),
                    }
                }
                let (stop_action, fut) = handle_stop_action(&mut recv);
                match stop_action {
                    OnStop::Sleep => {
                        if let Some(fut) = fut {
                            fut.await.unwrap();
                            continue;
                        }
                    }
                    OnStop::Exit => {
                        break;
                    }
                    OnStop::Restart => (),
                }
                match run_main(&docker, &*net_ctl, &manifest, &tor_keys).await {
                    Ok(Ok(())) => break,
                    Ok(Err(e)) => {
                        todo!("application crashed")
                    }
                    Err(e) => {
                        todo!("failed to start application")
                    }
                }
            }
        });
        Ok(Manager { on_stop, thread })
    }
}

impl Drop for Manager {
    fn drop(&mut self) {
        let _ = self.on_stop.send(OnStop::Exit);
    }
}
