import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ShortLink {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinkApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000';

  createLink(url: string): Observable<ShortLink> {
    return this.http.post<ShortLink>(`${this.apiUrl}/api/links`, { url });
  }

  listLinks(): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(`${this.apiUrl}/api/links`);
  }
}
