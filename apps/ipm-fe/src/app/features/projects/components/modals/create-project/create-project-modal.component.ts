import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../../../../core/services/users.service';
import type { Project, ProjectType, UserSummary } from '@sebsa-pm-tool/shared-models';

export interface ProjectFormData {
  name: string;
  description: string;
  type: ProjectType;
  customType?: string;
  memberIds: string[];
}

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 'IFS_IMPLEMENTATION', label: 'IFS Implementation' },
  { value: 'IFS_SUPPORT', label: 'IFS Support' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CUSTOMIZATION', label: 'Customization' },
  { value: 'UPGRADE', label: 'Upgrade' },
  { value: 'CONFIGURATION', label: 'Configuration' },
  { value: 'CUSTOM', label: 'Custom' },
];

@Component({
  standalone: true,
  selector: 'create-project-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-project-modal.component.html',
  styleUrl: './create-project-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateProjectModalComponent implements OnChanges {
  private readonly usersService = inject(UsersService);

  @Input() isOpen = false;
  @Input() editingProject: Project | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<ProjectFormData>();

  protected readonly typeOptions = PROJECT_TYPE_OPTIONS;

  projectName = '';
  description = '';
  type: ProjectType | '' = '';
  customType = '';
  teamMemberSearch = '';
  selectedMembers: UserSummary[] = [];

  protected readonly availableMembers = signal<UserSummary[]>([]);
  protected readonly isEditMode = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.isEditMode.set(!!this.editingProject);
      this.prefillForm();
      this.loadAvailableMembers();
    }
  }

  private prefillForm(): void {
    if (this.editingProject) {
      this.projectName = this.editingProject.name;
      this.description = this.editingProject.description ?? '';
      this.type = this.editingProject.type;
      this.customType = this.editingProject.customType ?? '';
    } else {
      this.resetForm();
    }
  }

  private loadAvailableMembers(): void {
    this.usersService.search('').subscribe({
      next: (users) => this.availableMembers.set(users),
      error: () => this.availableMembers.set([]),
    });
  }

  getFilteredMembers(): UserSummary[] {
    const term = this.teamMemberSearch.trim().toLowerCase();
    return this.availableMembers().filter(
      (candidate) =>
        !this.selectedMembers.find((s) => s.id === candidate.id) &&
        (!term || candidate.name.toLowerCase().includes(term)),
    );
  }

  selectMember(member: UserSummary): void {
    this.selectedMembers = [...this.selectedMembers, member];
    this.teamMemberSearch = '';
  }

  removeMember(memberId: string): void {
    this.selectedMembers = this.selectedMembers.filter((m) => m.id !== memberId);
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    if (!this.projectName.trim()) {
      alert('Please enter a project name');
      return;
    }
    if (!this.type) {
      alert('Please select a project type');
      return;
    }
    if (this.type === 'CUSTOM' && !this.customType.trim()) {
      alert('Please enter a name for the custom project type');
      return;
    }

    const formData: ProjectFormData = {
      name: this.projectName,
      description: this.description,
      type: this.type,
      customType: this.type === 'CUSTOM' ? this.customType : undefined,
      memberIds: this.selectedMembers.map((m) => m.id),
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  private resetForm(): void {
    this.projectName = '';
    this.description = '';
    this.type = '';
    this.customType = '';
    this.teamMemberSearch = '';
    this.selectedMembers = [];
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
