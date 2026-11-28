"use client";

// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\screens\TournamentZonePlanningScreen.js
// (grilla nueva de "Armado Manual - Editar": PairNameCell, PairCellsRow, fila
// "Coinciden", fila "Canchas ocupadas", chips de filtro, bloques por
// categoria plegables, chips de dia). Una diferencia deliberada con la app:
// en la web las categorias hermanas son totalmente editables desde esta
// misma pantalla (armar zona, horario, disponibilidad), no solo de lectura
// como en la app. El resto del diseno (fila=pareja, columna=hora, columna de
// nombres fija, un dia a la vez con chips arriba, colores por categoria) es
// el mismo. Cualquier cambio de ese diseno compartido tiene que replicarse
// tambien alla, y viceversa.

import { memo } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { getCategoryColor, getHoursStatusTag, getTotalLoadedHours, isSlotAvailable, buildPairSelectionKey, formatHourRangeLabel, type HourColumn } from "@/lib/availabilityGrid";
import { PAIR_COLORS, getShortPairLabel } from "./FixtureTab";

export type GridFilter =
  | { type: "all" }
  | { type: "category"; tournamentId: string }
  | { type: "problems" }
  | { type: "unassigned" };

export type CategoryBlock = {
  tournamentId: string;
  categoryLabel: string;
  isActive: boolean;
  confirmedRegistrations: any[];
  zones: any[];
  assignedIds: Set<string>;
};

export type GridRow =
  | { type: "category-header"; key: string; block: CategoryBlock; colorIndex: number; isCollapsed: boolean }
  | { type: "pair"; key: string; block: CategoryBlock; colorIndex: number; registration: any; zoneLetter: string }
  | { type: "coinciden"; key: string; block: CategoryBlock; colorIndex: number }
  | { type: "canchas-ocupadas"; key: string };

const NAME_COL_W = 176;
const HOUR_COL_W = 50;
const DAY_CHIPS_H = 40;
const HOUR_LABEL_H = 24;
const HEADER_H = HOUR_LABEL_H;
const PAIR_ROW_H = 52;
const SMALL_ROW_H = 26;

// col.covered=false es un "hueco" entre dos franjas horarias de la misma
// sede+dia (ej. 12 a 16 si hay franjas 08-12 y 16-00): no hay cancha ahi, asi
// que la columna entera se grisa en TODAS las filas (hora, parejas,
// coinciden, canchas ocupadas) para que se note de un vistazo que no se
// puede programar nada en ese rango, en vez de ocultar la columna (que
// rompería la alineación de horas y daría la sensación de un salto raro).
const GAP_COLUMN_BG = "#EAE7E0";

function CellsRow({ hourColumns, height, renderCell }: {
  hourColumns: HourColumn[]; height: number; renderCell: (col: HourColumn) => React.ReactNode;
}) {
  return (
    <div className="flex" style={{ height }}>
      {hourColumns.map((col) => (
        <div key={col.minutes} style={{ width: HOUR_COL_W, flexShrink: 0, background: col.covered ? undefined : GAP_COLUMN_BG }} className="flex items-center justify-center">
          {renderCell(col)}
        </div>
      ))}
    </div>
  );
}

// Celda fija de la izquierda con el nombre de la pareja (columna que no se
// desplaza horizontalmente). Memoizada: al pintar/despintar una celda de
// disponibilidad solo cambia el objeto `registration` de ESA pareja (las
// demas filas conservan su referencia), asi que no se re-renderizan.
export const PairNameCell = memo(function PairNameCell({
  registration, isEditable, isSelected, zoneLetter, onPress,
}: {
  registration: any; isEditable: boolean; isSelected: boolean; zoneLetter: string; onPress: (id: string) => void;
}) {
  const color = PAIR_COLORS[registration.__colorIndex % PAIR_COLORS.length];
  const hoursStatus = getHoursStatusTag(getTotalLoadedHours(registration));
  const statusColor = hoursStatus.tone === "danger" ? "#C0392B" : hoursStatus.tone === "warning" ? "#B8860B" : "#0F5F37";

  return (
    <button
      type="button"
      disabled={!isEditable}
      onClick={isEditable ? () => onPress(registration.id) : undefined}
      className="w-full text-left px-2.5 py-1.5 relative"
      style={{
        height: PAIR_ROW_H,
        background: color.bg,
        opacity: isEditable ? 1 : 0.75,
        cursor: isEditable ? "pointer" : "default",
        boxShadow: isSelected ? "inset 0 0 0 2px #086847" : "inset 0 -1px 0 #E3EFE8",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-bold leading-tight line-clamp-2" style={{ color: color.text, maxWidth: zoneLetter ? 120 : 148 }}>
          {getShortPairLabel(registration, registration.__colorIndex)}
        </span>
        {zoneLetter ? (
          <span className="shrink-0 w-4 h-4 rounded-full text-[9px] font-bold leading-none flex items-center justify-center text-white" style={{ background: "#086847" }}>
            {zoneLetter}
          </span>
        ) : null}
      </div>
      <span className="text-[9px] font-semibold" style={{ color: statusColor }}>{hoursStatus.label}</span>
      {isSelected ? (
        <span className="absolute top-1 right-1">
          <Check size={10} style={{ color: "#086847" }} />
        </span>
      ) : null}
    </button>
  );
},
(prev, next) =>
  prev.registration.id === next.registration.id &&
  prev.registration.availability === next.registration.availability &&
  prev.registration.__colorIndex === next.registration.__colorIndex &&
  prev.isEditable === next.isEditable &&
  prev.isSelected === next.isSelected &&
  prev.zoneLetter === next.zoneLetter
);

// Fila de celdas de disponibilidad de una pareja, para el dia elegido.
// Tambien memoizada por la misma razon que PairNameCell.
export const PairCellsRow = memo(function PairCellsRow({
  registration, hourColumns, selectedDayKey, isEditable, onToggleCell,
}: {
  registration: any; hourColumns: HourColumn[]; selectedDayKey: string; isEditable: boolean;
  onToggleCell: (registration: any, dayKey: string, hourMinutes: number) => void;
}) {
  const color = PAIR_COLORS[registration.__colorIndex % PAIR_COLORS.length];

  return (
    <CellsRow
      hourColumns={hourColumns}
      height={PAIR_ROW_H}
      renderCell={(col) => {
        if (!col.covered) {
          return <div className="rounded" style={{ width: 38, height: 30, background: "#DEDAD1" }} />;
        }
        const available = isSlotAvailable(registration, selectedDayKey, col.minutes);
        return (
          <button
            type="button"
            disabled={!isEditable}
            onClick={isEditable ? () => onToggleCell(registration, selectedDayKey, col.minutes) : undefined}
            className="rounded"
            style={{
              width: 38,
              height: 30,
              background: available ? color.fill : "transparent",
              border: available ? "none" : "1px solid #EFF4F2",
              cursor: isEditable ? "pointer" : "default",
            }}
          />
        );
      }}
    />
  );
},
(prev, next) =>
  prev.registration.id === next.registration.id &&
  prev.registration.availability === next.registration.availability &&
  prev.registration.__colorIndex === next.registration.__colorIndex &&
  prev.hourColumns === next.hourColumns &&
  prev.selectedDayKey === next.selectedDayKey &&
  prev.isEditable === next.isEditable
);

function FilterChip({ active, onClick, label, borderColor }: { active: boolean; onClick: () => void; label: string; borderColor?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all"
      style={active
        ? { background: "#086847", color: "#FFF", borderColor: "#086847" }
        : { background: "#F6FBF8", color: "#086847", borderColor: borderColor || "#CFE7DC" }}
    >
      {label}
    </button>
  );
}

export default function AvailabilityGrid({
  dayOptions, selectedDayKey, onSelectDay, hourColumns,
  gridRows, selectedPairIds, onTogglePairSelect, onToggleCell, onToggleSiblingCollapsed,
  countPairsAvailableAtHour, getCourtsAvailableAtHour, countMatchesAtHour,
  gridFilter, setGridFilter, categoryFilterOptions, onOpenPreferences,
}: {
  // Dias con al menos una franja de cancha marcada para zonas, dentro de las
  // fechas del torneo. Si esta vacio, no hay ningun dia para elegir.
  dayOptions: { key: string; label: string }[];
  selectedDayKey: string;
  onSelectDay: (dayKey: string) => void;
  hourColumns: HourColumn[];
  gridRows: GridRow[];
  selectedPairIds: Set<string>;
  onTogglePairSelect: (tournamentId: string, registrationId: string) => void;
  onToggleCell: (tournamentId: string, registration: any, dayKey: string, hourMinutes: number) => void;
  onToggleSiblingCollapsed: (tournamentId: string) => void;
  countPairsAvailableAtHour: (block: CategoryBlock, dayKey: string, hourMinutes: number) => number;
  getCourtsAvailableAtHour: (dayKey: string, hourMinutes: number) => number;
  countMatchesAtHour: (dayKey: string, hourMinutes: number) => number;
  gridFilter: GridFilter;
  setGridFilter: (filter: GridFilter) => void;
  categoryFilterOptions: { tournamentId: string; label: string; count: number; colorIndex: number }[];
  // Boton "Ir a Preferencias" cuando no hay ningun dia con horarios de
  // cancha cargados. Si no se pasa, el aviso se muestra igual sin el boton.
  onOpenPreferences?: () => void;
}) {
  if (!dayOptions.length) {
    return (
      <div className="rounded-2xl border px-5 py-6 mb-5 text-center" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
        <p className="text-sm font-semibold mb-2" style={{ color: "#5F7D72" }}>
          Sin horarios de cancha cargados para los días del torneo.
        </p>
        {onOpenPreferences && (
          <button type="button" onClick={onOpenPreferences} className="text-xs font-bold underline" style={{ color: "#086847" }}>
            Ir a Preferencias
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* Chips de dia, como en la app: un dia a la vez */}
      <div className="flex gap-2 flex-wrap mb-3" style={{ minHeight: DAY_CHIPS_H }}>
        {dayOptions.map((day) => (
          <button
            key={day.key}
            type="button"
            onClick={() => onSelectDay(day.key)}
            className="px-4 py-2 rounded-full text-xs font-bold border transition-all"
            style={day.key === selectedDayKey
              ? { background: "#0B8457", color: "#FFF", borderColor: "#0B8457" }
              : { background: "#F6FBF8", color: "#086847", borderColor: "#CFE7DC" }}
          >
            {day.label}
          </button>
        ))}
      </div>

      <p className="text-xs mb-2" style={{ color: "#9BB8AE" }}>Los cambios de horario se guardan al instante.</p>

      <div className="flex gap-2 flex-wrap mb-3">
        <FilterChip active={gridFilter.type === "all"} onClick={() => setGridFilter({ type: "all" })} label="Todas" />
        {categoryFilterOptions.map((option) => (
          <FilterChip
            key={option.tournamentId}
            active={gridFilter.type === "category" && gridFilter.tournamentId === option.tournamentId}
            onClick={() => setGridFilter({ type: "category", tournamentId: option.tournamentId })}
            label={`${option.label} (${option.count})`}
            borderColor={getCategoryColor(option.colorIndex)}
          />
        ))}
        <FilterChip active={gridFilter.type === "problems"} onClick={() => setGridFilter({ type: "problems" })} label="Con problemas" />
        <FilterChip active={gridFilter.type === "unassigned"} onClick={() => setGridFilter({ type: "unassigned" })} label="Sin zona" />
      </div>

      {gridRows.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: "#9BB8AE" }}>No hay parejas para mostrar.</p>
      ) : !hourColumns.length ? (
        <div className="rounded-2xl border px-5 py-6 mb-5 text-center" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "#5F7D72" }}>
            Sin horarios de cancha cargados para este día.
          </p>
          {onOpenPreferences && (
            <button type="button" onClick={onOpenPreferences} className="text-xs font-bold underline" style={{ color: "#086847" }}>
              Ir a Preferencias
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#CFE7DC" }}>
          <div className="flex">
            {/* Columna fija de nombres (no se desplaza) */}
            <div style={{ width: NAME_COL_W, flexShrink: 0, borderRight: "2px solid #CFE7DC" }}>
              <div style={{ height: HEADER_H }} className="flex items-center px-2.5" >
                <span className="text-[10px] font-black uppercase" style={{ color: "#9BB8AE" }}>PAREJA</span>
              </div>
              {gridRows.map((row) => {
                if (row.type === "category-header") {
                  return (
                    <button
                      type="button"
                      key={row.key}
                      disabled={row.block.isActive}
                      onClick={() => onToggleSiblingCollapsed(row.block.tournamentId)}
                      className="w-full text-left px-2.5 flex items-center gap-2"
                      style={{ height: SMALL_ROW_H + 10, borderLeft: `4px solid ${getCategoryColor(row.colorIndex)}`, background: "#F6FBF8" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black truncate" style={{ color: "#173A2E" }}>
                          {row.block.categoryLabel || (row.block.isActive ? "Esta categoria" : "Categoria")}
                        </p>
                        <p className="text-[9px] truncate" style={{ color: "#9BB8AE" }}>
                          {row.block.confirmedRegistrations.length} pareja{row.block.confirmedRegistrations.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      {!row.block.isActive ? (row.isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : null}
                    </button>
                  );
                }

                if (row.type === "pair") {
                  return (
                    <PairNameCell
                      key={row.key}
                      registration={row.registration}
                      isEditable
                      isSelected={selectedPairIds.has(buildPairSelectionKey(row.block.tournamentId, row.registration.id))}
                      zoneLetter={row.zoneLetter}
                      onPress={(id) => onTogglePairSelect(row.block.tournamentId, id)}
                    />
                  );
                }

                if (row.type === "coinciden") {
                  return (
                    <div key={row.key} style={{ height: SMALL_ROW_H }} className="flex items-center px-2.5">
                      <span className="text-[9px] font-bold truncate" style={{ color: "#9BB8AE" }}>Coinciden</span>
                    </div>
                  );
                }

                return (
                  <div key={row.key} style={{ height: SMALL_ROW_H }} className="flex items-center px-2.5">
                    <span className="text-[9px] font-bold truncate" style={{ color: "#9BB8AE" }}>Canchas ocupadas</span>
                  </div>
                );
              })}
            </div>

            {/* Lado que se desplaza horizontalmente (las horas del dia elegido).
                minWidth: 0 es necesario: sin esto, un hijo de flex no se encoge
                por debajo del ancho de su contenido (min-width: auto por
                default), as que en vez de scrollear, empujaba a toda la fila
                (columna de nombres incluida) a desbordar la pantalla, sin
                barra de scroll ni forma de desplazarse. */}
            <div className="overflow-x-auto" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ width: "max-content" }}>
                <CellsRow
                  hourColumns={hourColumns}
                  height={HOUR_LABEL_H}
                  renderCell={(col) => <span className="text-[9px] font-mono" style={{ color: col.covered ? "#5F7D72" : "#A39E8E" }}>{formatHourRangeLabel(col.minutes)}</span>}
                />

                {gridRows.map((row) => {
                  if (row.type === "category-header") {
                    return <div key={row.key} style={{ height: SMALL_ROW_H + 10 }} />;
                  }

                  if (row.type === "pair") {
                    return (
                      <PairCellsRow
                        key={row.key}
                        registration={row.registration}
                        hourColumns={hourColumns}
                        selectedDayKey={selectedDayKey}
                        isEditable
                        onToggleCell={(registration, dayKey, hourMinutes) => onToggleCell(row.block.tournamentId, registration, dayKey, hourMinutes)}
                      />
                    );
                  }

                  if (row.type === "coinciden") {
                    const total = row.block.confirmedRegistrations.length || 1;
                    return (
                      <CellsRow
                        key={row.key}
                        hourColumns={hourColumns}
                        height={SMALL_ROW_H}
                        renderCell={(col) => {
                          if (!col.covered) {
                            return <span className="text-[9px] font-bold" style={{ color: "#A39E8E" }}>—</span>;
                          }
                          const count = countPairsAvailableAtHour(row.block, selectedDayKey, col.minutes);
                          const ratio = count / total;
                          return (
                            <div
                              className="rounded w-full h-full flex items-center justify-center"
                              style={count > 0 ? { background: getCategoryColor(row.colorIndex), opacity: 0.25 + ratio * 0.75 } : undefined}
                            >
                              <span className="text-[9px] font-bold" style={{ color: count > 0 ? "#FFF" : "#CBD9D2" }}>{count || ""}</span>
                            </div>
                          );
                        }}
                      />
                    );
                  }

                  return (
                    <CellsRow
                      key={row.key}
                      hourColumns={hourColumns}
                      height={SMALL_ROW_H}
                      renderCell={(col) => {
                        const courts = getCourtsAvailableAtHour(selectedDayKey, col.minutes);
                        const matches = countMatchesAtHour(selectedDayKey, col.minutes);
                        const isFull = courts > 0 && matches >= courts;
                        return (
                          <span className="text-[9px] font-bold" style={{ color: isFull ? "#C0392B" : "#5F7D72" }}>
                            {matches}/{courts}
                          </span>
                        );
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
