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
import { CustomersService } from '../../../../../core/services/customers.service';
import { CustomSelectComponent } from '../../../../../core/components/custom-select/custom-select.component';
import { UserAvatarComponent } from '../../../../../core/components/user-avatar/user-avatar.component';
import type {
  Customer,
  Project,
  ProjectStatus,
  ProjectType,
  UserSummary,
} from '@sebsa-pm-tool/shared-models';

export interface ProjectFormData {
  name: string;
  description: string;
  type: ProjectType;
  customType?: string;
  memberIds: string[];
  isCsoProject: boolean;
  customerId: string;
  /** Only meaningful in edit mode — a new project always starts PLANNING. */
  status?: ProjectStatus;
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

const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'PLANNING', label: 'Planning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];

@Component({
  standalone: true,
  selector: 'create-project-modal',
  imports: [CommonModule, FormsModule, CustomSelectComponent, UserAvatarComponent],
  templateUrl: './create-project-modal.component.html',
  styleUrl: './create-project-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateProjectModalComponent implements OnChanges {
  private readonly usersService = inject(UsersService);
  private readonly customersService = inject(CustomersService);

  @Input() isOpen = false;
  @Input() editingProject: Project | null = null;
  /** When true and not editing an existing project, the CSO checkbox
   *  starts checked — used when this modal is opened from the CSO
   *  Dashboard's "New CSO Project" entry point. */
  @Input() defaultCsoProject = false;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<ProjectFormData>();

  protected readonly typeOptions = PROJECT_TYPE_OPTIONS;
  protected readonly statusOptions = PROJECT_STATUS_OPTIONS;

  projectName = '';
  description = '';
  type: ProjectType | '' = '';
  customType = '';
  teamMemberSearch = '';
  selectedMembers: UserSummary[] = [];
  isCsoProject = false;
  customerId = '';
  status: ProjectStatus = 'PLANNING';

  protected readonly availableMembers = signal<UserSummary[]>([]);
  protected readonly availableCustomers = signal<Customer[]>([]);
  protected readonly isEditMode = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.isEditMode.set(!!this.editingProject);
      this.prefillForm();
      this.loadAvailableMembers();
      this.loadAvailableCustomers();
    }
  }

  private prefillForm(): void {
    if (this.editingProject) {
      this.projectName = this.editingProject.name;
      this.description = this.editingProject.description ?? '';
      this.type = this.editingProject.type;
      this.customType = this.editingProject.customType ?? '';
      this.isCsoProject = this.editingProject.isCsoProject;
      this.customerId = this.editingProject.customerId;
      this.status = this.editingProject.status;
    } else {
      this.resetForm();
      this.isCsoProject = this.defaultCsoProject;
    }
  }

  private loadAvailableMembers(): void {
    this.usersService.search('').subscribe({
      next: (users) => this.availableMembers.set(users),
      error: () => this.availableMembers.set([]),
    });
  }

  private loadAvailableCustomers(): void {
    this.customersService.list().subscribe({
      next: (customers) => this.availableCustomers.set(customers),
      error: () => this.availableCustomers.set([]),
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

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
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
    if (!this.customerId) {
      alert('Please select a customer');
      return;
    }

    const formData: ProjectFormData = {
      name: this.projectName,
      description: this.description,
      type: this.type,
      customType: this.type === 'CUSTOM' ? this.customType : undefined,
      memberIds: this.selectedMembers.map((m) => m.id),
      isCsoProject: this.isCsoProject,
      customerId: this.customerId,
      status: this.isEditMode() ? this.status : undefined,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.projectName = '';
    this.description = '';
    this.type = '';
    this.customType = '';
    this.teamMemberSearch = '';
    this.selectedMembers = [];
    this.isCsoProject = false;
    this.customerId = '';
    this.status = 'PLANNING';
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
