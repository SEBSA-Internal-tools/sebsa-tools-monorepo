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

export interface CalendarDayItem {
  date: Date;
  dateString: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

@Component({
  standalone: true,
  selector: 'app-custom-datepicker',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomDatepickerComponent),
      multi: true,
    },
  ],
  templateUrl: './custom-datepicker.component.html',
  styleUrls: ['./custom-datepicker.component.scss'],
})
export class CustomDatepickerComponent implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);

  @Input() placeholder = 'Select date';
  @Input() ariaLabel = 'Date picker';
  @Input() customClass = '';
  @Input() disabled = false;
  @Input() isDueDate = false;
  @Input() min = '';
  @Input() max = '';
  @Input() align: 'left' | 'right' | 'auto' = 'auto';

  @Input()
  get value(): string {
    return this.currentValue();
  }
  set value(val: string | Date | null | undefined) {
    this.currentValue.set(this.normalizeDateString(val));
    this.syncViewWithDate(this.currentValue());
  }

  @Output() valueChange = new EventEmitter<string>();
  @Output() dateChange = new EventEmitter<string>();

  readonly isOpen = signal(false);
  readonly isRightAligned = signal(false);
  readonly currentValue = signal<string>(''); // YYYY-MM-DD
  readonly viewYear = signal<number>(new Date().getFullYear());
  readonly viewMonth = signal<number>(new Date().getMonth()); // 0-11
  readonly showMonthYearPicker = signal<boolean>(false);

  readonly weekDays = WEEK_DAYS;
  readonly monthNames = MONTH_NAMES;

  private onChange: (value: string) => void = (_val: string): void => {
    // Registered by ControlValueAccessor
  };
  private onTouched: () => void = (): void => {
    // Registered by ControlValueAccessor
  };

  readonly currentMonthLabel = computed(() => {
    return `${this.monthNames[this.viewMonth()]} ${this.viewYear()}`;
  });

  readonly displayValue = computed(() => {
    const val = this.currentValue();
    if (!val) return '';
    try {
      const [year, month, day] = val.split('-').map(Number);
      if (year && month && day) {
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return val;
  });

  readonly calendarDays = computed<CalendarDayItem[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const selected = this.currentValue();
    const todayStr = this.formatDate(new Date());

    const firstDayOfMonth = new Date(year, month, 1);
    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: CalendarDayItem[] = [];

    // Preceding days from previous month
    for (let i = startDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, d);
      const dateString = this.formatDate(prevMonthDate);
      days.push({
        date: prevMonthDate,
        dateString,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateString === todayStr,
        isSelected: dateString === selected,
        isDisabled: this.isDateDisabled(dateString),
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const currentMonthDate = new Date(year, month, d);
      const dateString = this.formatDate(currentMonthDate);
      days.push({
        date: currentMonthDate,
        dateString,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateString === todayStr,
        isSelected: dateString === selected,
        isDisabled: this.isDateDisabled(dateString),
      });
    }

    // Trailing days from next month to fill complete grid
    const remainingDays = 42 - days.length;
    if (remainingDays > 0 && remainingDays < 7) {
      for (let d = 1; d <= remainingDays; d++) {
        const nextMonthDate = new Date(year, month + 1, d);
        const dateString = this.formatDate(nextMonthDate);
        days.push({
          date: nextMonthDate,
          dateString,
          dayNumber: d,
          isCurrentMonth: false,
          isToday: dateString === todayStr,
          isSelected: dateString === selected,
          isDisabled: this.isDateDisabled(dateString),
        });
      }
    } else if (days.length <= 35) {
      const count = 35 - days.length;
      for (let d = 1; d <= count; d++) {
        const nextMonthDate = new Date(year, month + 1, d);
        const dateString = this.formatDate(nextMonthDate);
        days.push({
          date: nextMonthDate,
          dateString,
          dayNumber: d,
          isCurrentMonth: false,
          isToday: dateString === todayStr,
          isSelected: dateString === selected,
          isDisabled: this.isDateDisabled(dateString),
        });
      }
    }

    return days;
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
    if (!this.isOpen()) {
      this.syncViewWithDate(this.currentValue());
      this.showMonthYearPicker.set(false);
      this.updateAlignment();
      this.isOpen.set(true);
    } else {
      this.close();
    }
  }

  private updateAlignment(): void {
    if (this.align === 'right') {
      this.isRightAligned.set(true);
      return;
    }
    if (this.align === 'left') {
      this.isRightAligned.set(false);
      return;
    }
    if (typeof window !== 'undefined') {
      const el = this.elementRef.nativeElement as HTMLElement;
      const rect = el.getBoundingClientRect();

      // Check nearest modal, card, or dialog parent container
      const container = el.closest('.modal-container, .modal-body, .workspace-card, .meta-card, [role="dialog"], .task-detail-card') as HTMLElement | null;
      if (container) {
        const parentRect = container.getBoundingClientRect();
        // If opening ~300px from rect.left would overflow the container's right boundary (with 16px buffer)
        const wouldOverflowContainer = (rect.left + 300) > (parentRect.right - 16);
        this.isRightAligned.set(wouldOverflowContainer);
        return;
      }

      const wouldOverflowRight = rect.left + 310 > window.innerWidth;
      this.isRightAligned.set(wouldOverflowRight);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.showMonthYearPicker.set(false);
    this.onTouched();
  }

  prevMonth(event?: Event): void {
    if (event) event.stopPropagation();
    let m = this.viewMonth() - 1;
    let y = this.viewYear();
    if (m < 0) {
      m = 11;
      y--;
    }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  nextMonth(event?: Event): void {
    if (event) event.stopPropagation();
    let m = this.viewMonth() + 1;
    let y = this.viewYear();
    if (m > 11) {
      m = 0;
      y++;
    }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  prevYear(event?: Event): void {
    if (event) event.stopPropagation();
    this.viewYear.update((y) => y - 1);
  }

  nextYear(event?: Event): void {
    if (event) event.stopPropagation();
    this.viewYear.update((y) => y + 1);
  }

  toggleMonthYearPicker(event?: Event): void {
    if (event) event.stopPropagation();
    this.showMonthYearPicker.update((v) => !v);
  }

  selectMonth(monthIndex: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.viewMonth.set(monthIndex);
    this.showMonthYearPicker.set(false);
  }

  selectDay(day: CalendarDayItem, event?: Event): void {
    if (event) event.stopPropagation();
    if (day.isDisabled) return;

    this.emitDate(day.dateString);
    this.close();
  }

  setToday(event?: Event): void {
    if (event) event.stopPropagation();
    const todayStr = this.formatDate(new Date());
    if (!this.isDateDisabled(todayStr)) {
      this.emitDate(todayStr);
      this.close();
    }
  }

  clearDate(event?: Event): void {
    if (event) event.stopPropagation();
    this.emitDate('');
    this.close();
  }

  private emitDate(dateStr: string): void {
    this.currentValue.set(dateStr);
    this.onChange(dateStr);
    this.onTouched();
    this.valueChange.emit(dateStr);
    this.dateChange.emit(dateStr);
  }

  private syncViewWithDate(dateStr: string): void {
    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
          this.viewYear.set(y);
          this.viewMonth.set(m);
          return;
        }
      }
    }
    const today = new Date();
    this.viewYear.set(today.getFullYear());
    this.viewMonth.set(today.getMonth());
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalizeDateString(val: string | Date | null | undefined): string {
    if (!val) return '';
    if (typeof val === 'string') {
      return val.slice(0, 10);
    }
    if (val instanceof Date) {
      return this.formatDate(val);
    }
    return '';
  }

  readonly isDueDateField = computed(() => {
    if (this.isDueDate) return true;
    const label = (this.ariaLabel || '').toLowerCase();
    const placeholder = (this.placeholder || '').toLowerCase();
    return label.includes('due') || placeholder.includes('due');
  });

  get todayString(): string {
    return this.formatDate(new Date());
  }

  isDateDisabled(dateStr: string): boolean {
    if (this.isDueDateField() && dateStr < this.todayString) {
      return true;
    }
    if (this.min && dateStr < this.min) return true;
    if (this.max && dateStr > this.max) return true;
    return false;
  }

  // ControlValueAccessor methods
  writeValue(obj: string | Date | null | undefined): void {
    const norm = this.normalizeDateString(obj);
    this.currentValue.set(norm);
    this.syncViewWithDate(norm);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
