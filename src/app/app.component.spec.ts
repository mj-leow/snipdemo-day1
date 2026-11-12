import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ShortLink } from './link-api.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    return fixture;
  }

  it('creates the app and renders the Snip heading', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.title).toBe('snip-frontend');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Make links shorter.');
  });

  it('rejects non-http URLs without submitting', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    app.urlControl.setValue('ftp://example.com');
    app.urlControl.markAsTouched();
    app.createLink();

    expect(app.urlControl.hasError('httpUrl')).toBeTrue();
    http.expectNone((request) => request.method === 'POST');
  });

  it('creates a link and refreshes the list', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    const link: ShortLink = {
      code: 'a1B2c3',
      url: 'https://example.com',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    app.urlControl.setValue(link.url);
    app.createLink();
    http.expectOne({ method: 'POST', url: 'http://localhost:3000/api/links' }).flush(link);
    http.expectOne('http://localhost:3000/api/links').flush([link]);

    expect(app.createdLink()).toEqual(link);
    expect(app.links()).toEqual([link]);
    expect(app.submitting()).toBeFalse();
  });

  it('shows server validation errors beside the URL field', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    app.urlControl.setValue('https://example.com');
    app.createLink();
    http.expectOne({ method: 'POST', url: 'http://localhost:3000/api/links' }).flush(
      { error: 'URL is invalid' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(app.urlControl.getError('server')).toBe('URL is invalid');
    expect(app.submitting()).toBeFalse();
  });
});
