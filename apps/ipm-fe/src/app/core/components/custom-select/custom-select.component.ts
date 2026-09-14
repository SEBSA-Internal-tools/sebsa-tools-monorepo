import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  HostListener,
  inject,
  signal,
  computed,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SelectOptionItem<T = any> {
  value: T;
  label: string;
  icon?: string;
  badge?: string;
}

@Component({
  standalone: true,
  selector: 'app-custom-select',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true,
    },
  ],
  templateUrl: './custom-select.component.html',
  styleUrls: ['./custom-select.component.scss'],
})
export class CustomSelectComponent<T = any> implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);

  private _options: any[] = [];

  @Input()
  get options(): any[] {
    return this._options;
  }
  set options(val: any[] | SelectOptionItem<T>[] | readonly SelectOptionItem<T>[] | null | undefined) {
    this._options = (val as any[]) || [];
  }

  @Input() placeholder = 'Select an option';
  @Input() defaultOptionLabel = '';
  @Input() defaultOptionValue: any = '';
  @Input() ariaLabel = '';
  @Input() customClass = '';
  @Input() disabled = false;

  @Input()
  get value(): T {
    return this.currentValue();
  }
  set value(val: T) {
    this.currentValue.set(val);
  }

  @Output() valueChange = new EventEmitter<T>();
  @Output() selectionChange = new EventEmitter<T>();

  readonly isOpen = signal(false);
  readonly currentValue = signal<any>('');

  private onChange: (value: any) => void = (_val: any): void => {
    // Registered by ControlValueAccessor
  };
  private onTouched: () => void = (): void => {
    // Registered by ControlValueAccessor
  };

  readonly normalizedOptions = computed<SelectOptionItem<T>[]>(() => {
    return (this._options || []).map((item) => {
      if (typeof item === 'string') {
        return { value: item as unknown as T, label: item };
      }
      if (typeof item === 'number') {
        return { value: item as unknown as T, label: String(item) };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, any>;
        const val = obj['value'] !== undefined ? obj['value'] : obj['id'] !== undefined ? obj['id'] : obj['key'];
        const lbl = obj['label'] !== undefined ? String(obj['label']) : obj['name'] !== undefined ? String(obj['name']) : obj['title'] !== undefined ? String(obj['title']) : String(val);
        return {
          value: val as T,
          label: lbl,
          icon: typeof obj['icon'] === 'string' ? obj['icon'] : undefined,
          badge: typeof obj['badge'] === 'string' ? obj['badge'] : undefined,
        };
      }
      return { value: item as T, label: String(item) };
    });
  });

  readonly displayLabel = computed<string>(() => {
    const val = this.currentValue();
    if (val === '' || val === null || val === undefined || val === this.defaultOptionValue) {
      return this.defaultOptionLabel || this.placeholder;
    }
    const match = this.normalizedOptions().find((opt) => opt.value === val);
    if (match) return match.label;
    return String(val);
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
    }
  }

  toggleOpen(event?: Event): void {
    if (event) event.stopPropagation();
    if (this.disabled) return;
    this.isOpen.update((v) => !v);
    if (!this.isOpen()) {
      this.onTouched();
    }
  }

  open(): void {
    if (!this.disabled) this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.onTouched();
  }

  selectOption(val: T): void {
    this.currentValue.set(val);
    this.onChange(val);
    this.onTouched();
    this.valueChange.emit(val);
    this.selectionChange.emit(val);
    this.close();
  }

  // ControlValueAccessor methods
  writeValue(obj: any): void {
    this.currentValue.set(obj);
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
