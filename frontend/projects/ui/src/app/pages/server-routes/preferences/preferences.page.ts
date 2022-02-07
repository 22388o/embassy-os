import { Component, ViewChild } from '@angular/core'
import { PatchDbService } from 'src/app/services/patch-db/patch-db.service'
import {
  IonContent,
  LoadingController,
  ModalController,
  ToastController,
} from '@ionic/angular'
import {
  GenericInputComponent,
  GenericInputOptions,
} from 'src/app/modals/generic-input/generic-input.component'
import { ConfigSpec } from 'src/app/pkg-config/config-types'
import { ApiService } from 'src/app/services/api/embassy-api.service'
import { ServerConfigService } from 'src/app/services/server-config.service'
import { take } from 'rxjs/operators'
import { toastController } from '@ionic/core'
import { LocalStorageService } from '../../../services/local-storage.service'

@Component({
  selector: 'preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
})
export class PreferencesPage {
  @ViewChild(IonContent) content: IonContent
  fields = fields
  defaultName: string
  clicks = 0

  constructor(
    private readonly loadingCtrl: LoadingController,
    private readonly modalCtrl: ModalController,
    private readonly api: ApiService,
    public readonly serverConfig: ServerConfigService,
    private readonly toastCtrl: ToastController,
    private readonly localStorage: LocalStorageService,
    public readonly patch: PatchDbService,
  ) {}

  ngOnInit() {
    this.defaultName = `Embassy-${this.patch.getData()['server-info'].id}`
  }

  ngAfterViewInit() {
    this.content.scrollToPoint(undefined, 1)
  }

  async presentModalName(): Promise<void> {
    const options: GenericInputOptions = {
      title: 'Edit Device Name',
      message: 'This is for your reference only.',
      label: 'Device Name',
      useMask: false,
      placeholder: this.defaultName,
      nullable: true,
      initialValue: this.patch.getData().ui.name,
      buttonText: 'Save',
      submitFn: (value: string) =>
        this.setDbValue('name', value || this.defaultName),
    }

    const modal = await this.modalCtrl.create({
      componentProps: { options },
      cssClass: 'alertlike-modal',
      presentingElement: await this.modalCtrl.getTop(),
      component: GenericInputComponent,
    })

    await modal.present()
  }

  async setDbValue(key: string, value: any): Promise<void> {
    const loader = await this.loadingCtrl.create({
      spinner: 'lines',
      message: 'Saving...',
      cssClass: 'loader',
    })
    await loader.present()

    try {
      await this.api.setDbValue({ pointer: `/${key}`, value })
    } finally {
      loader.dismiss()
    }
  }

  async addClick() {
    this.clicks++
    if (this.clicks >= 5) {
      this.clicks = 0
      await this.localStorage.toggleShowDevTools()
      console.log('TOOLS', this.localStorage.showDevTools)
      const toast = await this.toastCtrl.create({
        header: this.localStorage.showDevTools
          ? 'Dev tools unlocked!'
          : 'Dev tools hidden :(',
        message: this.localStorage.showDevTools
          ? 'Dev tools are now accessable in the main menu'
          : 'Say goodbye to dev tools forever',
        position: 'bottom',
        cssClass: this.localStorage.showDevTools
          ? 'success-toast'
          : 'warning-toast',
        duration: 1000,
      })

      await toast.present()
    }
    setTimeout(() => {
      this.clicks = Math.max(this.clicks - 1, 0)
    }, 10000)
  }
}

const fields: ConfigSpec = {
  name: {
    name: 'Device Name',
    type: 'string',
    nullable: false,
    masked: false,
    copyable: false,
  },
}
