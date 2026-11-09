import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CustomSelectComponent } from './custom-select.component';
describe('shared select keyboard access', () => {
  let fixture: ComponentFixture<CustomSelectComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CustomSelectComponent] }).compileComponents();
    fixture = TestBed.createComponent(CustomSelectComponent);
    fixture.componentInstance.options = ['Alpha', 'Beta'];
    fixture.detectChanges();
  });
  it('opens and moves focus through options with arrow keys', async () => {
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await Promise.resolve();
    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(document.activeElement).toBe(options[0]);
    options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await Promise.resolve();
    expect(document.activeElement).toBe(options[1]);
  });
  it('selects an option and returns focus to the trigger', () => {
    const changed = jest.fn();
    fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.open(); fixture.detectChanges();
    fixture.nativeElement.querySelector('[role="option"]').click();
    expect(changed).toHaveBeenCalledWith('Alpha');
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.custom-select-trigger'));
  });
  it('keeps a disabled select closed on arrow input', () => {
    fixture.componentInstance.disabled = true;
    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });
});
