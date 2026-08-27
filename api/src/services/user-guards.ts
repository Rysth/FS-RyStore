/**
 * Authorization rules for acting on another user, extracted from the
 * before_action chain in Api::V1::UsersController.
 *
 * They are pure functions over role lists so each rule can be tested on its
 * own — in Rails they were spread across `authorize_show`,
 * `check_admin_user_modification`, `check_self_role_elevation`, `update_roles`,
 * `assign_roles` and inline checks inside `destroy` and `toggle_confirmation`.
 *
 * Every message is the exact Spanish string the Rails version returned.
 */

export type Actor = { userId: string; roles: string[] };
export type Target = { userId: string; roles: string[] };

export type GuardFailure = { message: string; statusCode: number };

const has = (roles: string[], role: string) => roles.includes(role);

/** A user may view their own profile; otherwise admin or manager is required. */
export function canView(actor: Actor, target: Target): GuardFailure | null {
  if (actor.userId === target.userId) return null;
  if (has(actor.roles, "admin") || has(actor.roles, "manager")) return null;
  return { message: "No tienes permiso para ver este usuario", statusCode: 403 };
}

/** Only an admin may modify an admin. */
export function canModify(actor: Actor, target: Target): GuardFailure | null {
  if (has(target.roles, "admin") && !has(actor.roles, "admin")) {
    return { message: "No tienes permiso para modificar usuarios administradores", statusCode: 403 };
  }
  return null;
}

export function canDelete(actor: Actor, target: Target): GuardFailure | null {
  if (actor.userId === target.userId) {
    return { message: "No puedes eliminar tu propio usuario", statusCode: 403 };
  }
  if (has(target.roles, "manager") && !has(actor.roles, "admin")) {
    return { message: "Solo los administradores pueden eliminar usuarios gerentes", statusCode: 403 };
  }
  return canModify(actor, target);
}

export function canUnconfirm(actor: Actor, target: Target): GuardFailure | null {
  if (has(target.roles, "admin") && !has(actor.roles, "admin")) {
    return { message: "No puedes desconfirmar a un administrador", statusCode: 403 };
  }
  if (actor.userId === target.userId) {
    return { message: "No puedes desconfirmar tu propio usuario", statusCode: 403 };
  }
  return null;
}

/**
 * Validates a requested role change.
 *
 * Rails applied these in two places with overlapping conditions; they are
 * collected here in the order it evaluated them.
 */
export function canChangeRoles(
  actor: Actor,
  target: Target,
  requested: string[],
): GuardFailure | null {
  const isSelf = actor.userId === target.userId;
  const actorIsAdmin = has(actor.roles, "admin");

  if (isSelf) {
    if (has(actor.roles, "manager") && !actorIsAdmin) {
      return { message: "Los gerentes no pueden modificar sus propios roles", statusCode: 403 };
    }
    // No granting yourself something you do not already hold.
    const added = requested.filter((role) => !actor.roles.includes(role));
    if (added.length > 0) {
      return { message: "No puedes elevar tus propios privilegios", statusCode: 403 };
    }
  }

  if (!actorIsAdmin && has(actor.roles, "manager") && has(target.roles, "manager")) {
    if (!requested.includes("manager")) {
      return { message: "Solo los administradores pueden quitar el rol de gerente", statusCode: 403 };
    }
  }

  return null;
}

/**
 * The role list actually written, after the rules that silently drop entries
 * rather than reject the request — matching Rails' `assign_roles`, which
 * skipped the admin role for non-admins and re-added a user's own roles.
 */
export function effectiveRoles(actor: Actor, target: Target, requested: string[]): string[] {
  const actorIsAdmin = has(actor.roles, "admin");

  // Only an admin can hand out the admin role.
  let result = requested.filter((role) => role !== "admin" || actorIsAdmin);

  // Editing yourself never drops your existing roles.
  if (actor.userId === target.userId) {
    result = [...new Set([...result, ...target.roles])];
  }

  return [...new Set(result)];
}
