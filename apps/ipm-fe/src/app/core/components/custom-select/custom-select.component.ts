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
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule,
} from '@angular/forms';

export interface SelectOptionItem<T = unknown> {
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
  host: {
    '[class.dropdown-open]': 'isOpen()',
  },
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
export class CustomSelectComponent<T = unknown>
  implements ControlValueAccessor
{
  private readonly elementRef = inject(ElementRef);

  private readonly _options = signal<unknown[]>([]);

  @Input()
  get options(): unknown[] {
    return this._options();
  }
  set options(
    val:
      | unknown[]
      | SelectOptionItem<T>[]
      | readonly SelectOptionItem<T>[]
      | null
      | undefined,
  ) {
    this._options.set((val as unknown[]) || []);
  }

  private readonly _placeholder = signal('Select an option');
  @Input()
  get placeholder(): string {
    return this._placeholder();
  }
  set placeholder(val: string) {
    this._placeholder.set(val || 'Select an option');
  }

  private readonly _defaultOptionLabel = signal('');
  @Input()
  get defaultOptionLabel(): string {
    return this._defaultOptionLabel();
  }
  set defaultOptionLabel(val: string) {
    this._defaultOptionLabel.set(val || '');
  }

  private readonly _defaultOptionValue = signal<unknown>('');
  @Input()
  get defaultOptionValue(): unknown {
    return this._defaultOptionValue();
  }
  set defaultOptionValue(val: unknown) {
    this._defaultOptionValue.set(val !== undefined ? val : '');
  }

  private readonly _selectedLabel = signal('');
  @Input()
  get selectedLabel(): string {
    return this._selectedLabel();
  }
  set selectedLabel(val: string) {
    this._selectedLabel.set(val || '');
  }

  @Input() ariaLabel = '';
  @Input() customClass = '';
  @Input() disabled = false;

  @Input()
  get value(): T {
    return this.currentValue() as T;
  }
  set value(val: T) {
    this.currentValue.set(val);
  }

  @Output() valueChange = new EventEmitter<T>();
  @Output() selectionChange = new EventEmitter<T>();

  readonly isOpen = signal(false);
  readonly currentValue = signal<unknown>('');

  private onChange: (value: unknown) => void = (_val: unknown): void => {
    // Registered by ControlValueAccessor
  };
  private onTouched: () => void = (): void => {
    // Registered by ControlValueAccessor
  };

  readonly normalizedOptions = computed<SelectOptionItem<T>[]>(() => {
    return (this._options() || []).map((item) => {
      if (typeof item === 'string') {
        return { value: item as unknown as T, label: item };
      }
      if (typeof item === 'number') {
        return { value: item as unknown as T, label: String(item) };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const val =
          obj['value'] !== undefined
            ? obj['value']
            : obj['id'] !== undefined
              ? obj['id']
              : obj['key'];
        const lbl =
          obj['label'] !== undefined
            ? String(obj['label'])
            : obj['name'] !== undefined
              ? String(obj['name'])
              : obj['title'] !== undefined
                ? String(obj['title'])
                : String(val);
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
    const defVal = this._defaultOptionValue();
    if (val === '' || val === null || val === undefined || val === defVal) {
      return this._defaultOptionLabel() || this._placeholder();
    }
    const match = this.normalizedOptions().find((opt) => opt.value === val);
    if (match) return match.label;
    if (this._selectedLabel()) return this._selectedLabel();

    const strVal = String(val);
    if (this.isIdLike(strVal)) {
      return (
        this._defaultOptionLabel() || this._placeholder() || 'Select an option'
      );
    }

    return strVal;
  });

  private isIdLike(val: string): boolean {
    if (!val) return false;
    // Standard UUID (e.g. 99231de4-67c1-4e00-bd03-04e...)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
      return true;
    }
    // MongoDB ObjectID or 24-32 hex char ID
    if (/^[0-9a-f]{24,32}$/i.test(val)) {
      return true;
    }
    // CUID format
    if (/^c[a-z0-9]{24,}$/i.test(val)) {
      return true;
    }
    // Long alphanumeric ID (>= 16 chars containing letters and numbers/dashes/underscores)
    if (val.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(val) && /\d/.test(val) && /[a-zA-Z]/.test(val)) {
      return true;
    }
    return false;
  }

  isOptionSelected(optValue: unknown): boolean {
    const cur = this.currentValue();
    const defVal = this._defaultOptionValue();
    if (optValue === defVal) {
      return cur === '' || cur === null || cur === undefined || cur === defVal;
    }
    return cur === optValue;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (
      this.isOpen() &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
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

  selectDefaultOption(): void {
    this.selectOption(this._defaultOptionValue() as T);
  }

  // ControlValueAccessor methods
  writeValue(obj: unknown): void {
    this.currentValue.set(obj);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
