import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageCroppedEvent, ImageCropperComponent, ImageTransform } from 'ngx-image-cropper';

/** Square crop step shown after picking a file in Settings, before the
 * profile picture is actually uploaded. */
@Component({
  standalone: true,
  selector: 'app-avatar-cropper-modal',
  imports: [CommonModule, FormsModule, ImageCropperComponent],
  templateUrl: './avatar-cropper-modal.component.html',
  styleUrl: './avatar-cropper-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarCropperModalComponent {
  @Input() isOpen = false;
  @Input() file: File | null = null;

  @Output() cropped = new EventEmitter<Blob>();
  @Output() cancelled = new EventEmitter<void>();

  zoom = 1;
  transform: ImageTransform = { scale: 1 };
  private croppedBlob: Blob | null = null;

  onZoomChange(value: number): void {
    this.zoom = value;
    this.transform = { ...this.transform, scale: value };
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.croppedBlob = event.blob ?? null;
  }

  onCancel(): void {
    this.reset();
    this.cancelled.emit();
  }

  onConfirm(): void {
    if (this.croppedBlob) {
      this.cropped.emit(this.croppedBlob);
    }
    this.reset();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  private reset(): void {
    this.zoom = 1;
    this.transform = { scale: 1 };
    this.croppedBlob = null;
  }
}
