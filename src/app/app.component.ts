import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LinkApiService, ShortLink } from './link-api.service';

const httpUrlValidator: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null => {
  const value = control.value.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly api = inject(LinkApiService);

  readonly title = 'snip-frontend';
  readonly form = this.formBuilder.group({
    url: ['', [Validators.required, httpUrlValidator]],
  });
  readonly links = signal<ShortLink[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly submitError = signal('');
  readonly createdLink = signal<ShortLink | null>(null);

  get urlControl() {
    return this.form.controls.url;
  }

  ngOnInit(): void {
    this.refreshLinks();
  }

  refreshLinks(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.listLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load links. Check that the API is running, then try again.');
        this.loading.set(false);
      },
    });
  }

  createLink(): void {
    this.form.markAllAsTouched();
    this.submitError.set('');
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.createdLink.set(null);
    this.api.createLink(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.submitting.set(false);
        this.form.reset();
        this.refreshLinks();
      },
      error: (error: HttpErrorResponse) => {
        const message = this.getErrorMessage(error);
        this.urlControl.setErrors({ ...this.urlControl.errors, server: message });
        this.urlControl.markAsTouched();
        this.submitError.set(message);
        this.submitting.set(false);
      },
    });
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    const serverMessage = error.error?.error;
    if (typeof serverMessage === 'string') {
      return serverMessage;
    }
    return 'Could not create the link. Check that the API is running and try again.';
  }
}
