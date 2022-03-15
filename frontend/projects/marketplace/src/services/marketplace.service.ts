import { Observable } from 'rxjs'
import { MarketplacePkg } from '../types/marketplace-pkg'
import { Marketplace } from '../types/marketplace'

export abstract class AbstractMarketplaceService {
  abstract install(id: string, version?: string): Observable<unknown>

  abstract getMarketplace(): Observable<Marketplace>

  abstract getReleaseNotes(id: string): Observable<Record<string, string>>

  abstract getCategories(): Observable<string[]>

  abstract getPackages(): Observable<MarketplacePkg[]>

  abstract getPackage(id: string, version: string): Observable<MarketplacePkg>

  abstract getLicense(): Observable<string>

  abstract getInstructions(): Observable<string>
}
