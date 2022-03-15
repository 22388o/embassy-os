import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import { AlertController, ModalController } from '@ionic/angular'
import {
  MarketplacePkg,
  AbstractMarketplaceService,
} from '@start9labs/marketplace'
import { displayEmver, Emver } from '@start9labs/shared'
import { take } from 'rxjs/operators'

import { MarkdownPage } from 'src/app/modals/markdown/markdown.page'

@Component({
  selector: 'marketplace-show-additional',
  templateUrl: 'marketplace-show-additional.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceShowAdditionalComponent {
  @Input()
  pkg: MarketplacePkg

  @Output()
  version = new EventEmitter<string>()

  constructor(
    private readonly alertCtrl: AlertController,
    private readonly modalCtrl: ModalController,
    private readonly marketplaceService: AbstractMarketplaceService,
    private readonly emver: Emver,
  ) {}

  async presentAlertVersions() {
    const alert = await this.alertCtrl.create({
      header: 'Versions',
      inputs: this.pkg.versions
        .sort((a, b) => -1 * this.emver.compare(a, b))
        .map(v => ({
          name: v, // for CSS
          type: 'radio',
          label: displayEmver(v), // appearance on screen
          value: v, // literal SEM version value
          checked: this.pkg.manifest.version === v,
        })),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Ok',
          handler: (version: string) => this.version.emit(version),
          cssClass: 'enter-click',
        },
      ],
    })

    await alert.present()
  }

  async presentModalMd(title: 'license' | 'instructions') {
    const content$ =
      title === 'license'
        ? this.marketplaceService.getLicense()
        : this.marketplaceService.getInstructions()

    content$.pipe(take(1)).subscribe(async content => {
      const modal = await this.modalCtrl.create({
        componentProps: {
          title,
          content,
        },
        component: MarkdownPage,
      })
      await modal.present()
    })
  }
}
