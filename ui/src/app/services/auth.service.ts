import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { distinctUntilChanged } from 'rxjs/operators'
import { ApiService } from './api/api.service'
import { Storage } from '@ionic/storage'
import { StorageKeys } from '../models/storage-keys'

export enum AuthState {
  UNVERIFIED,
  VERIFIED,
  INITIALIZING,
}
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly authState$: BehaviorSubject<AuthState> = new BehaviorSubject(AuthState.INITIALIZING)

  constructor (
    private readonly api: ApiService,
    private readonly storage: Storage,
  ) { }

  async init (): Promise<void> {
    const loggedIn = await this.storage.get(StorageKeys.LOGGED_IN_KEY)
    this.authState$.next( loggedIn ? AuthState.VERIFIED : AuthState.UNVERIFIED)
  }

  watch$ (): Observable<AuthState> {
    return this.authState$.pipe(distinctUntilChanged())
  }

  async login (password: string): Promise<void> {
    await this.api.login({ password })
    await this.storage.set(StorageKeys.LOGGED_IN_KEY, true)
    this.authState$.next(AuthState.VERIFIED)
  }

  async setUnverified (): Promise<void> {
    this.authState$.next(AuthState.UNVERIFIED)
  }
}
