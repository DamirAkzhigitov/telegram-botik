import { google } from 'googleapis'

export class GoogleSearchService {
  private customSearch = google.customsearch('v1')
  private storedResults: any[] = []

  constructor(
    private apiKey: string,
    private cx: string
  ) {
    if (!this.apiKey || !this.cx) {
      throw new Error(
        'GoogleSearchService requires valid apiKey and cx (search engine ID).'
      )
    }
  }
  public async search(
    query: string,
    options?: { [key: string]: any }
  ): Promise<any> {
    try {
      const response = await this.customSearch.cse.list({
        q: query,
        cx: this.cx,
        auth: this.apiKey,
        ...options
      })

      // Extract items from the response (if any)
      const items =
        response.data?.items?.map((item) => ({
          title: item.title,
          snippet: item.snippet
        })) || []
      this.storedResults = items

      return items
    } catch (error) {
      console.error('Error during Google Custom Search:', error)
      throw error
    }
  }
  public getStoredResults(): any[] {
    return this.storedResults
  }
  public clearStoredResults(): void {
    this.storedResults = []
  }
}
