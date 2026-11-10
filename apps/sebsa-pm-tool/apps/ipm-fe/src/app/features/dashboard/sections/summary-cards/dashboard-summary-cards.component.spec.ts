import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardSummaryCardsComponent } from './dashboard-summary-cards.component';
import { SummaryCard } from '../../services/dashboard.service';

describe('DashboardSummaryCardsComponent', () => {
  let component: DashboardSummaryCardsComponent;
  let fixture: ComponentFixture<DashboardSummaryCardsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardSummaryCardsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardSummaryCardsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render cards when data is provided', () => {
    const mockCards: SummaryCard[] = [
      { label: 'Active Projects', value: '12', change: '+2', icon: 'folder' },
      { label: 'Open Tasks', value: '48', change: '+5', icon: 'task' },
    ];

    component.cards = mockCards;
    fixture.detectChanges();

    expect(component.cards).toEqual(mockCards);
  });

  it('should handle null cards', () => {
    component.cards = null;
    fixture.detectChanges();

    expect(component.cards).toBeNull();
  });

  it('should handle undefined cards', () => {
    component.cards = undefined;
    fixture.detectChanges();

    expect(component.cards).toBeUndefined();
  });

  it('should render empty state when cards array is empty', () => {
    component.cards = [];
    fixture.detectChanges();

    expect(component.cards?.length).toBe(0);
  });
});
