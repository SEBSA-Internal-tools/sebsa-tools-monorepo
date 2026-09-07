import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  input,
  output,
  signal,
  ElementRef,
  type OnInit,
  type AfterViewInit,
  type OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { CaseType, CaseStatus } from '@sebsa-pm-tool/shared-models';
import type {
  CalendarColorByMode,
  CalendarDateMode,
  CalendarDay,
  CalendarDensity,
  CalendarItem,
  CalendarViewMode,
  DayWorkloadPip,
  QuickPresetFilter,
} from '../../models/calendar.models';

@Component({
  standalone: true,
  selector: 'app-calendar-view',
  imports: [CommonModule, FormsModule],
  templateUrl: './calendar-view.component.html',
  styleUrls: ['./calendar-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarViewComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private removeWheelListener?: () => void;
  private wheelCooldown = false;

  // Inputs
  readonly items = input<CalendarItem[]>([]);
  readonly initialDate = input<Date>(new Date());
  readonly initialView = input<CalendarViewMode>('month');
  readonly currentUserId = input<string | undefined>();
  readonly currentUserName = input<string | undefined>();
  readonly loading = input<boolean>(false);

  // Outputs
  readonly itemClick = output<CalendarItem>();
  readonly dayClick = output<Date>();
  readonly createClick = output<Date>();
  readonly viewChange = output<CalendarViewMode>();
  readonly dateChange = output<Date>();

  // State Signals
  readonly currentDate = signal<Date>(new Date());
  readonly currentView = signal<CalendarViewMode>('month');
  readonly selectedDate = signal<Date | null>(null);
  readonly selectedItem = signal<CalendarItem | null>(null);

  // Advanced UI/UX States
  readonly colorBy = signal<CalendarColorByMode>('type');
  readonly density = signal<CalendarDensity>('comfortable');
  readonly quickPreset = signal<QuickPresetFilter>('all');
  readonly dateMode = signal<CalendarDateMode>('dueDate'); // default: due date
  readonly hoveredItem = signal<{ item: CalendarItem; x: number; y: number } | null>(null);
  readonly expandedDay = signal<CalendarDay | null>(null);

  // Filters
  readonly searchQuery = signal<string>('');
  readonly selectedType = signal<CaseType | 'ALL'>('ALL');
  readonly selectedStatus = signal<CaseStatus | 'ALL'>('ALL');

  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  readonly dateModeOptions: { id: CalendarDateMode; label: string; icon: string }[] = [
    { id: 'dueDate', label: 'Due Date', icon: 'event_available' },
    { id: 'startDate', label: 'Start Date', icon: 'play_circle' },
    { id: 'createdAt', label: 'Created Date', icon: 'schedule' },
  ];

  readonly caseTypes: { id: CaseType | 'ALL'; label: string; icon: string }[] = [
    { id: 'ALL', label: 'All Types', icon: 'apps' },
    { id: 'BUG', label: 'Bugs', icon: 'bug_report' },
    { id: 'STORY', label: 'Stories', icon: 'bookmark' },
    { id: 'EPIC', label: 'Epics', icon: 'bolt' },
    { id: 'IMPROVEMENT', label: 'Improvements', icon: 'trending_up' },
    { id: 'TEST', label: 'Tests', icon: 'verified' },
  ];

  readonly caseStatuses: { id: CaseStatus | 'ALL'; label: string }[] = [
    { id: 'ALL', label: 'All Statuses' },
    { id: 'TO_DO', label: 'To Do' },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'IN_REVIEW', label: 'In Review' },
    { id: 'BLOCKED', label: 'Blocked' },
    { id: 'DONE', label: 'Done' },
  ];

  readonly colorByOptions: { id: CalendarColorByMode; label: string; icon: string }[] = [
    { id: 'type', label: 'Type', icon: 'category' },
    { id: 'priority', label: 'Priority', icon: 'flag' },
    { id: 'project', label: 'Project', icon: 'folder' },
    { id: 'status', label: 'Status', icon: 'check_circle' },
  ];

  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (this.initialDate()) {
      this.currentDate.set(new Date(this.initialDate()));
    }
    if (this.initialView()) {
      this.currentView.set(this.initialView());
    }
  }

  ngAfterViewInit(): void {
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const wheelHandler = (event: WheelEvent) => {
      // Only handle wheel navigation in Month View
      if (this.currentView() !== 'month') return;
      // Do not hijack scroll if inspection drawer or day flyout is open
      if (this.selectedItem() || this.expandedDay()) return;

      const target = event.target as HTMLElement | null;
      const isOverGrid = target?.closest('.month-view-container') !== null;
      if (!isOverGrid) return;

      // CRUCIAL: With { passive: false }, preventDefault stops the entire browser page from scrolling!
      event.preventDefault();
      event.stopPropagation();

      if (Math.abs(event.deltaY) < 18) return;

      if (this.wheelCooldown) return;
      this.wheelCooldown = true;

      setTimeout(() => {
        this.wheelCooldown = false;
      }, 260);

      if (event.deltaY > 0) {
        this.next();
      } else {
        this.previous();
      }
    };

    hostEl.addEventListener('wheel', wheelHandler, { passive: false });
    this.removeWheelListener = () => {
      hostEl.removeEventListener('wheel', wheelHandler);
    };
  }

  ngOnDestroy(): void {
    this.removeWheelListener?.();
  }

  // Quick Preset Counts for Badges
  readonly presetCounts = computed(() => {
    const list = this.items() || [];
    const myName = (this.currentUserName() || '').toLowerCase().trim();
    const myId = this.currentUserId();

    let myCases = 0;
    let overdue = 0;
    let blocked = 0;

    for (const item of list) {
      const matchesId = myId && (item.assigneeId === myId || item.assigneeIds?.includes(myId));
      const matchesName = myName && item.assignee?.toLowerCase().includes(myName);
      if (matchesId || matchesName) {
        myCases++;
      }
      if (item.isOverdue) {
        overdue++;
      }
      const statusUpper = (item.status || '').toUpperCase();
      if (statusUpper === 'BLOCKED' || item.isBlocked) {
        blocked++;
      }
    }

    return { myCases, overdue, blocked, total: list.length };
  });

  // Filtered items incorporating search, types, statuses, and quick presets
  readonly filteredItems = computed<CalendarItem[]>(() => {
    const list = this.items() || [];
    const query = this.searchQuery().trim().toLowerCase();
    const type = this.selectedType();
    const status = this.selectedStatus();
    const preset = this.quickPreset();
    const myName = (this.currentUserName() || '').toLowerCase().trim();
    const myId = this.currentUserId();

    return list.filter((item) => {
      // 1. Preset filter
      if (preset === 'my-cases') {
        const matchesId = myId && (item.assigneeId === myId || item.assigneeIds?.includes(myId));
        const matchesName = myName && item.assignee?.toLowerCase().includes(myName);
        if (!matchesId && !matchesName) return false;
      } else if (preset === 'overdue') {
        if (!item.isOverdue) return false;
      } else if (preset === 'blocked') {
        const statusUpper = (item.status || '').toUpperCase();
        if (statusUpper !== 'BLOCKED' && !item.isBlocked) return false;
      }

      // 2. Type and status filters
      if (type !== 'ALL' && item.type !== type) return false;
      if (status !== 'ALL' && item.status !== status) return false;

      // 3. Search query
      if (query) {
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesProject = item.projectName?.toLowerCase().includes(query) ?? false;
        const matchesAssignee = item.assignee?.toLowerCase().includes(query) ?? false;
        const matchesNumber = item.caseNumber?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesProject && !matchesAssignee && !matchesNumber) {
          return false;
        }
      }
      return true;
    });
  });

  // Calendar Header Title
  readonly headerTitle = computed<string>(() => {
    const curr = this.currentDate();
    const view = this.currentView();

    if (view === 'week') {
      const start = this.getStartOfWeek(curr);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      const startMonth = start.toLocaleString('default', { month: 'short' });
      const endMonth = end.toLocaleString('default', { month: 'short' });
      const year = end.getFullYear();

      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
      }
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
    }

    return curr.toLocaleString('default', { month: 'long', year: 'numeric' });
  });

  // Active Month Range (Start to End date)
  readonly headerMonthRange = computed<string>(() => {
    const curr = this.currentDate();
    const year = curr.getFullYear();
    const month = curr.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthShort = curr.toLocaleString('default', { month: 'short' });
    return `${monthShort} 1 – ${monthShort} ${lastDay}`;
  });

  // Month Grid Calculation with Workload Pips, Date-Field mapping, and Priority sorting
  readonly monthDays = computed<CalendarDay[]>(() => {
    const current = this.currentDate();
    const year = current.getFullYear();
    const month = current.getMonth();
    const todayStr = this.formatDateKey(new Date());
    const selStr = this.selectedDate() ? this.formatDateKey(this.selectedDate()!) : null;
    const mode = this.dateMode();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const lastDayNum = lastDayOfMonth.getDate();

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const currentMonthName = current.toLocaleString('default', { month: 'short' });
    const prevMonthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'short' });
    const nextMonthName = new Date(year, month + 1, 1).toLocaleString('default', { month: 'short' });

    const days: CalendarDay[] = [];
    const items = this.filteredItems();

    // Group items by their active date (according to dateMode: dueDate / startDate / createdAt)
    const itemMap = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = this.getItemActiveDate(item, mode);
      if (key) {
        if (!itemMap.has(key)) {
          itemMap.set(key, []);
        }
        itemMap.get(key)!.push(item);
      }
    }

    const buildDay = (
      d: Date,
      isCurrentMonth: boolean,
      dayNum: number,
      isNextMonth: boolean,
      isPrevMonth: boolean,
      monthName: string
    ): CalendarDay => {
      const dStr = this.formatDateKey(d);
      const dayItems = itemMap.get(dStr) || [];
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      // Arrange and sort items properly (Priority: Urgent -> High -> Med -> Low, Blocked first, then Title)
      this.sortDayItems(dayItems);

      // Workload pips
      const pipMap = new Map<CaseType, number>();
      let hasOverdue = false;
      let hasBlocked = false;

      for (const item of dayItems) {
        const t = item.type || 'GENERAL';
        pipMap.set(t, (pipMap.get(t) || 0) + 1);
        if (item.isOverdue) hasOverdue = true;
        if (item.status === 'BLOCKED' || item.isBlocked) hasBlocked = true;
      }

      const workloadPips: DayWorkloadPip[] = [];
      pipMap.forEach((count, type) => {
        workloadPips.push({
          type,
          count,
          color: this.getTypePipColor(type),
        });
      });

      return {
        date: d,
        dateString: dStr,
        dayNumber: dayNum,
        monthName,
        isCurrentMonth,
        isNextMonth,
        isPrevMonth,
        isMonthStart: isCurrentMonth && dayNum === 1,
        isMonthEnd: isCurrentMonth && dayNum === lastDayNum,
        isToday: dStr === todayStr,
        isSelected: dStr === selStr,
        isWeekend,
        items: dayItems,
        workloadPips,
        hasOverdue,
        hasBlocked,
      };
    };

    // Previous month filler days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const d = new Date(year, month - 1, dayNum);
      days.push(buildDay(d, false, dayNum, false, true, prevMonthName));
    }

    // Current month days
    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      days.push(buildDay(dateObj, true, d, false, false, currentMonthName));
    }

    // Next month filler days (fill up to 35 or 42 grid cells)
    const targetLength = days.length <= 35 ? 35 : 42;
    let nextMonthDay = 1;
    while (days.length < targetLength) {
      const dateObj = new Date(year, month + 1, nextMonthDay);
      days.push(buildDay(dateObj, false, nextMonthDay, true, false, nextMonthName));
      nextMonthDay++;
    }

    return days;
  });

  // Week Days Calculation
  readonly weekDays = computed<CalendarDay[]>(() => {
    const curr = this.currentDate();
    const startOfWeek = this.getStartOfWeek(curr);
    const todayStr = this.formatDateKey(new Date());
    const selStr = this.selectedDate() ? this.formatDateKey(this.selectedDate()!) : null;
    const mode = this.dateMode();

    const items = this.filteredItems();
    const itemMap = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = this.getItemActiveDate(item, mode);
      if (key) {
        if (!itemMap.has(key)) {
          itemMap.set(key, []);
        }
        itemMap.get(key)!.push(item);
      }
    }

    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dStr = this.formatDateKey(d);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const dayItems = itemMap.get(dStr) || [];

      this.sortDayItems(dayItems);

      let hasOverdue = false;
      let hasBlocked = false;
      for (const it of dayItems) {
        if (it.isOverdue) hasOverdue = true;
        if (it.status === 'BLOCKED' || it.isBlocked) hasBlocked = true;
      }

      days.push({
        date: d,
        dateString: dStr,
        dayNumber: d.getDate(),
        monthName: d.toLocaleString('default', { month: 'short' }),
        isCurrentMonth: d.getMonth() === curr.getMonth(),
        isNextMonth: d.getMonth() > curr.getMonth() || d.getFullYear() > curr.getFullYear(),
        isPrevMonth: d.getMonth() < curr.getMonth() || d.getFullYear() < curr.getFullYear(),
        isMonthStart: d.getDate() === 1,
        isMonthEnd: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selStr,
        isWeekend,
        items: dayItems,
        workloadPips: [],
        hasOverdue,
        hasBlocked,
      });
    }

    return days;
  });

  // Agenda Groups Calculation
  readonly agendaGroups = computed<{ date: Date; dateString: string; label: string; items: CalendarItem[] }[]>(() => {
    const items = this.filteredItems();
    const today = new Date();
    const todayStr = this.formatDateKey(today);
    const mode = this.dateMode();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = this.formatDateKey(tomorrow);

    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = this.getItemActiveDate(item, mode);
      if (key) {
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(item);
      }
    }

    const sortedDates = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

    return sortedDates.map((dStr) => {
      const parts = dStr.split('-').map((p) => parseInt(p, 10));
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

      let label = dateObj.toLocaleDateString('default', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      if (dStr === todayStr) {
        label = `Today, ${label}`;
      } else if (dStr === tomorrowStr) {
        label = `Tomorrow, ${label}`;
      }

      const dayItems = grouped.get(dStr) || [];
      this.sortDayItems(dayItems);

      return {
        date: dateObj,
        dateString: dStr,
        label,
        items: dayItems,
      };
    });
  });

  // Navigation actions
  previous(): void {
    const curr = new Date(this.currentDate());
    const view = this.currentView();
    if (view === 'week') {
      curr.setDate(curr.getDate() - 7);
    } else {
      curr.setMonth(curr.getMonth() - 1);
    }
    this.currentDate.set(curr);
    this.dateChange.emit(curr);
  }

  next(): void {
    const curr = new Date(this.currentDate());
    const view = this.currentView();
    if (view === 'week') {
      curr.setDate(curr.getDate() + 7);
    } else {
      curr.setMonth(curr.getMonth() + 1);
    }
    this.currentDate.set(curr);
    this.dateChange.emit(curr);
  }

  goToToday(): void {
    const now = new Date();
    this.currentDate.set(now);
    this.selectedDate.set(now);
    this.dateChange.emit(now);
  }

  setView(view: CalendarViewMode): void {
    this.currentView.set(view);
    this.viewChange.emit(view);
  }

  setColorBy(mode: CalendarColorByMode): void {
    this.colorBy.set(mode);
  }

  setDensity(density: CalendarDensity): void {
    this.density.set(density);
  }

  setDateMode(mode: CalendarDateMode): void {
    this.dateMode.set(mode);

    // If the currently viewed month has no cases in this mode, auto-focus on the month containing cases
    const items = this.filteredItems();
    const currentYear = this.currentDate().getFullYear();
    const currentMonth = this.currentDate().getMonth();

    const hasCasesInCurrentMonth = items.some((item) => {
      const dStr = this.getItemActiveDate(item, mode);
      if (!dStr) return false;
      const parts = dStr.split('-').map((p) => parseInt(p, 10));
      return parts[0] === currentYear && parts[1] - 1 === currentMonth;
    });

    if (!hasCasesInCurrentMonth && items.length > 0) {
      for (const item of items) {
        const dStr = this.getItemActiveDate(item, mode);
        if (dStr && dStr.length >= 10) {
          const parts = dStr.split('-').map((p) => parseInt(p, 10));
          if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            const targetDate = new Date(parts[0], parts[1] - 1, 1);
            this.currentDate.set(targetDate);
            this.dateChange.emit(targetDate);
            break;
          }
        }
      }
    }
  }

  setQuickPreset(preset: QuickPresetFilter): void {
    if (this.quickPreset() === preset) {
      this.quickPreset.set('all');
    } else {
      this.quickPreset.set(preset);
    }
  }

  onDayClick(day: CalendarDay): void {
    this.selectedDate.set(day.date);
    if (!day.isCurrentMonth) {
      // Clicking on a day from next or previous month automatically navigates into that month!
      const target = new Date(day.date.getFullYear(), day.date.getMonth(), 1);
      this.currentDate.set(target);
      this.dateChange.emit(target);
    }
    this.dayClick.emit(day.date);
  }

  onItemClick(item: CalendarItem, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.hoveredItem.set(null);
    this.expandedDay.set(null);
    this.selectedItem.set(item);
    this.itemClick.emit(item);
  }

  // Hover Popover (Zero-Click Preview - Active in Month and Week, Disabled in Agenda)
  onItemMouseEnter(item: CalendarItem, event: MouseEvent): void {
    if (this.currentView() === 'agenda') return;
    if (this.selectedItem()) return;

    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);

    const targetEl = event.currentTarget as HTMLElement | null;
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    this.hoverTimeout = setTimeout(() => {
      const popoverWidth = 260;
      const popoverHeight = 140;

      // Center horizontally relative to hovered target
      let x = rect.left + rect.width / 2 - popoverWidth / 2;
      // Clamp x inside viewport so it never overflows screen edge
      x = Math.max(16, Math.min(x, window.innerWidth - popoverWidth - 16));

      // Position below target by default
      let y = rect.bottom + 6;
      // If overflowing viewport bottom, flip above target
      if (y + popoverHeight > window.innerHeight - 16) {
        y = Math.max(16, rect.top - popoverHeight - 6);
      }

      this.hoveredItem.set({ item, x, y });
    }, 140);
  }

  onItemMouseLeave(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoveredItem.set(null);
  }

  // Interactive "+N more" Inline Day Popover
  openDayFlyout(day: CalendarDay, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.hoveredItem.set(null);
    this.expandedDay.set(day);
  }

  closeDayFlyout(): void {
    this.expandedDay.set(null);
  }

  onFlyoutBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDayFlyout();
    }
  }

  closeDrawer(): void {
    this.selectedItem.set(null);
  }

  onDrawerBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDrawer();
    }
  }

  triggerCreateForDate(date: Date, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.createClick.emit(date);
  }

  navigateToCase(item: CalendarItem): void {
    this.closeDrawer();
    this.router.navigate(['/cases', item.id]);
  }

  setTypeFilter(type: CaseType | 'ALL'): void {
    this.selectedType.set(type);
  }

  setStatusFilter(status: CaseStatus | 'ALL'): void {
    this.selectedStatus.set(status);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedType.set('ALL');
    this.selectedStatus.set('ALL');
    this.quickPreset.set('all');
    this.dateMode.set('dueDate');
  }

  getDateModeLabel(mode: CalendarDateMode): string {
    switch (mode) {
      case 'dueDate':
        return 'Due Date';
      case 'startDate':
        return 'Start Date';
      case 'createdAt':
        return 'Created Date';
    }
  }

  getItemActiveDate(item: CalendarItem, mode: CalendarDateMode): string {
    if (mode === 'dueDate') {
      return item.dueDate || '';
    }
    if (mode === 'startDate') {
      return item.startDate || '';
    }
    if (mode === 'createdAt') {
      return item.createdAt || '';
    }
    return item.date || '';
  }

  private sortDayItems(items: CalendarItem[]): void {
    const getPriorityRank = (p?: string): number => {
      const s = (p || '').toLowerCase();
      if (s.includes('urgent') || s.includes('crit')) return 1;
      if (s.includes('high')) return 2;
      if (s.includes('med')) return 3;
      return 4;
    };

    items.sort((a, b) => {
      const rA = getPriorityRank(a.priority);
      const rB = getPriorityRank(b.priority);
      if (rA !== rB) return rA - rB;

      if (a.status === 'BLOCKED' && b.status !== 'BLOCKED') return -1;
      if (b.status === 'BLOCKED' && a.status !== 'BLOCKED') return 1;

      if (a.status === 'DONE' && b.status !== 'DONE') return 1;
      if (b.status === 'DONE' && a.status !== 'DONE') return -1;

      return a.title.localeCompare(b.title);
    });
  }

  // Dynamic Color Resolution based on active colorBy() mode
  getItemColorClass(item: CalendarItem): string {
    const mode = this.colorBy();
    if (mode === 'priority') {
      return this.getPriorityClass(item.priority);
    }
    if (mode === 'status') {
      return this.getStatusClass(item.status);
    }
    if (mode === 'project') {
      return this.getProjectColorClass(item.projectName);
    }
    return this.getTypeClass(item.type);
  }

  getProjectColorClass(projectName?: string): string {
    if (!projectName) return 'color-project-0';
    let hash = 0;
    for (let i = 0; i < projectName.length; i++) {
      hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % 6;
    return `color-project-${idx}`;
  }

  getTypeClass(type?: CaseType): string {
    switch (type) {
      case 'BUG':
        return 'type-bug';
      case 'STORY':
        return 'type-story';
      case 'EPIC':
        return 'type-epic';
      case 'IMPROVEMENT':
        return 'type-improvement';
      case 'TEST':
        return 'type-test';
      default:
        return 'type-general';
    }
  }

  getTypePipColor(type?: CaseType): string {
    switch (type) {
      case 'BUG':
        return '#ef4444';
      case 'STORY':
        return '#3b82f6';
      case 'EPIC':
        return '#7000ff';
      case 'IMPROVEMENT':
        return '#f59e0b';
      case 'TEST':
        return '#10b981';
      default:
        return '#64748b';
    }
  }

  getTypeIcon(type?: CaseType): string {
    switch (type) {
      case 'BUG':
        return 'bug_report';
      case 'STORY':
        return 'bookmark';
      case 'EPIC':
        return 'bolt';
      case 'IMPROVEMENT':
        return 'trending_up';
      case 'TEST':
        return 'verified';
      default:
        return 'task';
    }
  }

  getStatusClass(status?: CaseStatus): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'status-in-progress';
      case 'IN_REVIEW':
        return 'status-in-review';
      case 'BLOCKED':
        return 'status-blocked';
      case 'DONE':
        return 'status-done';
      case 'CANCELLED':
        return 'status-cancelled';
      case 'TO_DO':
      default:
        return 'status-to-do';
    }
  }

  getStatusLabel(status?: CaseStatus): string {
    switch (status) {
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'IN_REVIEW':
        return 'In Review';
      case 'BLOCKED':
        return 'Blocked';
      case 'DONE':
        return 'Done';
      case 'CANCELLED':
        return 'Cancelled';
      case 'TO_DO':
      default:
        return 'To Do';
    }
  }

  getPriorityClass(priority?: string): string {
    const p = (priority || '').toLowerCase();
    if (p.includes('urgent') || p.includes('crit')) return 'priority-urgent';
    if (p.includes('high')) return 'priority-high';
    if (p.includes('med')) return 'priority-medium';
    return 'priority-low';
  }

  private getStartOfWeek(d: Date): Date {
    const date = new Date(d);
    let day = date.getDay() - 1;
    if (day === -1) day = 6;
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private formatDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
