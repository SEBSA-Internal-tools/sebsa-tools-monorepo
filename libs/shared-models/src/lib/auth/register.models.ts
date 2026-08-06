export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  departmentId: string;
}

export interface RegisterResponse {
  message: string;
}
