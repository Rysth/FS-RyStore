export interface SignInForm {
	email: string;
	password: string;
}

export interface SignUpForm {
	fullName: string;
	username: string;
	email: string;
	password: string;
	passwordConfirmation: string;
}

export interface ConfirmForm {
	email: string;
}

export interface ForgotPasswordForm {
	email: string;
}

export interface ResetPasswordForm {
	password: string;
	passwordConfirmation: string;
}

export interface User {
	id: string;
	email: string;
	username: string;
	fullname: string;
	roles: string[];
	permissions: string[];
	verified: boolean;
	created_at: string;
	updated_at: string;
}

// Permission constants (must match backend Permission model keys)
export const Permissions = {
	VIEW_DASHBOARD: "view_dashboard",
	VIEW_USERS: "view_users",
	CREATE_USERS: "create_users",
	EDIT_USERS: "edit_users",
	DELETE_USERS: "delete_users",
	EXPORT_USERS: "export_users",
	VIEW_BUSINESS: "view_business",
	EDIT_BUSINESS: "edit_business",
	EDIT_PROFILE: "edit_profile",
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];
