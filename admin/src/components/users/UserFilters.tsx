import { useState } from "react";

interface UserFiltersProps {
  onFilterChange: (filters: { role?: string }) => void;
  disabled?: boolean;
}

export default function UserFilters({
  onFilterChange,
  disabled = false,
}: UserFiltersProps) {
  const [role, setRole] = useState<string>("");

  const handleApplyFilters = () => {
    const filters: { role?: string } = {};

    if (role) filters.role = role;

    onFilterChange(filters);
  };

  const handleClearFilters = () => {
    setRole("");
    onFilterChange({});
  };

  return (
    <div className="card bg-white shadow-md border border-slate-200 rounded-xl">
      <div className="card-body p-4">
        <h3 className="font-semibold text-slate-700 mb-4 flex items-center">
          <i className="bx bx-filter-alt mr-2"></i>
          Filtros
        </h3>

        <div className="space-y-4">
          {/* Role Filter */}
          <div className="form-control">
            <label className="label" htmlFor="user-role-filter">
              <span className="label-text text-sm">Rol</span>
            </label>
            <select
              id="user-role-filter"
              className="select select-bordered select-sm w-full"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={disabled}
            >
              <option value="">Todos los roles</option>
              <option value="admin">Administrador</option>
              <option value="manager">Gerente</option>
              <option value="user">Usuario</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleApplyFilters}
              className="btn btn-primary btn-sm flex-1"
              disabled={disabled}
            >
              <i className="bx bx-filter-alt mr-1"></i>
              Aplicar
            </button>
            <button
              onClick={handleClearFilters}
              className="btn btn-ghost btn-sm flex-1"
              disabled={disabled}
            >
              <i className="bx bx-x mr-1"></i>
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
