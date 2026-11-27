"use client";

// GEMELO: d:\PROYECTO-APP\padel-amateur-app\src\screens\TournamentZonePlanningScreen.js
// (grilla nueva de "Armado Manual - Editar": PairNameCell, PairCellsRow, fila
// "Coinciden", fila "Canchas ocupadas", chips de filtro, bloques por
// categoria plegables). Dos diferencias deliberadas con la app: 1) en la web
// se muestran TODOS los dias del torneo lado a lado dentro del mismo scroll
// horizontal (la app muestra un dia a la vez con chips, por el espacio
// reducido de pantalla); 2) en la web las categorias hermanas son
// totalmente editables desde esta misma pantalla (armar zona, horario,
// disponibilidad), no solo de lectura como en la app. El resto del diseno
// (fila=pareja, columna=hora, columna de nombres fija, colores por
// categoria) es el mismo. Cualquier cambio de ese diseno compartido tiene
// que replicarse tambien alla, y viceversa.

import { memo, Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { getCategoryColor, getHoursStatusTag, getTotalLoadedHours, isSlotAvailable, buildPairSelectionKey, type HourColumn } from "@/lib/availabilityGrid";
import { PAIR_COLORS, getShortPairLabel } from "./FixtureTab";

export type DayBlock = { key: string; label: string; hourColumns: HourColumn[] };

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

type FlatColumn =
  | { kind: "divider"; id: string }
  | { kind: "empty-day"; id: string; blockIndex: number }
  | { kind: "hour"; id: string; dayKey: string; minutes: number; label: string; blockIndex: number };

const NAME_COL_W = 176;
const HOUR_COL_W = 44;
const DIVIDER_W = 18;
const DAY_TITLE_H = 26;
const HOUR_LABEL_H = 24;
const HEADER_H = DAY_TITLE_H + HOUR_LABEL_H;
const PAIR_ROW_H = 52;
const SMALL_ROW_H = 26;
// Ancho de un bloque de dia sin ningun horario de cancha cargado (en vez de
// un rango inventado, o de desaparecer con ancho 0, se muestra el aviso).
const EMPTY_DAY_W = 230;
// Fondo levemente distinto por dia (alternando), para que se note que son
// bloques separados y no una sola tira continua de cuadraditos.
const DAY_BG_TINTS = ["#FFFFFF", "#F4F9F6"];

function buildFlatColumns(dayBlocks: DayBlock[]): FlatColumn[] {
  const columns: FlatColumn[] = [];
  dayBlocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) columns.push({ kind: "divider", id: `div-${block.key}` });
    if (!block.hourColumns.length) {
      columns.push({ kind: "empty-day", id: `empty-${block.key}`, blockIndex });
      return;
    }
    block.hourColumns.forEach((hour) => {
      columns.push({ kind: "hour", id: `${block.key}:${hour.minutes}`, dayKey: block.key, minutes: hour.minutes, label: hour.label, blockIndex });
    });
  });
  return columns;
}

// Separador vertical bien visible entre dias (una linea, no solo un hueco).
function DividerCell({ height }: { height: number }) {
  return (
    <div style={{ width: DIVIDER_W, flexShrink: 0, height, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 2, height: "100%", background: "#CFE7DC" }} />
    </div>
  );
}

function CellsRow({ flatColumns, height, renderCell, renderEmptyDay }: {
  flatColumns: FlatColumn[]; height: number; renderCell: (col: FlatColumn & { kind: "hour" }) => ReactNode;
  renderEmptyDay?: (col: FlatColumn & { kind: "empty-day" }) => ReactNode;
}) {
  return (
    <div className="flex" style={{ height }}>
      {flatColumns.map((col) => {
        if (col.kind === "divider") return <DividerCell key={col.id} height={height} />;
        if (col.kind === "empty-day") {
          return (
            <div key={col.id} style={{ width: EMPTY_DAY_W, flexShrink: 0, background: DAY_BG_TINTS[col.blockIndex % DAY_BG_TINTS.length] }} className="flex items-center justify-center">
              {renderEmptyDay?.(col)}
            </div>
          );
        }
        return (
          <div key={col.id} style={{ width: HOUR_COL_W, flexShrink: 0, background: DAY_BG_TINTS[col.blockIndex % DAY_BG_TINTS.length] }} className="flex items-center justify-center">
            {renderCell(col)}
          </div>
        );
      })}
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

// Fila de celdas de disponibilidad de una pareja. Tambien memoizada por la
// misma razon que PairNameCell.
export const PairCellsRow = memo(function PairCellsRow({
  registration, flatColumns, isEditable, onToggleCell,
}: {
  registration: any; flatColumns: FlatColumn[]; isEditable: boolean; onToggleCell: (registration: any, dayKey: string, hourMinutes: number) => void;
}) {
  const color = PAIR_COLORS[registration.__colorIndex % PAIR_COLORS.length];

  return (
    <CellsRow
      flatColumns={flatColumns}
      height={PAIR_ROW_H}
      renderCell={(col) => {
        const available = isSlotAvailable(registration, col.dayKey, col.minutes);
        return (
          <button
            type="button"
            disabled={!isEditable}
            onClick={isEditable ? () => onToggleCell(registration, col.dayKey, col.minutes) : undefined}
            className="rounded"
            style={{
              width: 34,
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
  prev.flatColumns === next.flatColumns &&
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
  dayBlocks, gridRows, selectedPairIds, onTogglePairSelect, onToggleCell, onToggleSiblingCollapsed,
  countPairsAvailableAtHour, getCourtsAvailableAtHour, countMatchesAtHour,
  gridFilter, setGridFilter, categoryFilterOptions, onOpenPreferences,
}: {
  dayBlocks: DayBlock[];
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
  // Boton "Ir a Preferencias" dentro del aviso de un dia sin horarios de
  // cancha cargados. Si no se pasa, el aviso se muestra igual sin el boton.
  onOpenPreferences?: () => void;
}) {
  if (!dayBlocks.length) {
    return (
      <div className="rounded-2xl border px-5 py-6 mb-5 text-center" style={{ background: "#F6FBF8", borderColor: "#CFE7DC" }}>
        <p className="text-sm font-semibold" style={{ color: "#5F7D72" }}>
          Configura la disponibilidad de sedes/canchas en Preferencias para ver la grilla.
        </p>
      </div>
    );
  }

  const flatColumns = buildFlatColumns(dayBlocks);

  return (
    <div className="mb-5">
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

            {/* Lado que se desplaza horizontalmente: mismos dias uno al lado del otro.
                minWidth: 0 es necesario: sin esto, un hijo de flex no se encoge
                por debajo del ancho de su contenido (min-width: auto por
                default), as que en vez de scrollear, empujaba a toda la fila
                (columna de nombres incluida) a desbordar la pantalla, sin
                barra de scroll ni forma de desplazarse. */}
            <div className="overflow-x-auto" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ width: "max-content" }}>
                <div className="flex" style={{ height: DAY_TITLE_H }}>
                  {dayBlocks.map((block, blockIndex) => (
                    <Fragment key={block.key}>
                      {blockIndex > 0 && <DividerCell height={DAY_TITLE_H} />}
                      <div
                        style={{
                          width: (block.hourColumns.length ? block.hourColumns.length * HOUR_COL_W : EMPTY_DAY_W), flexShrink: 0,
                          background: DAY_BG_TINTS[blockIndex % DAY_BG_TINTS.length],
                          borderBottom: "2px solid #086847",
                          overflow: "hidden",
                        }}
                        className="flex items-center justify-center text-[11px] font-black uppercase px-1"
                        title={block.label}
                      >
                        <span style={{ color: "#086847", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {block.label}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>

                <CellsRow
                  flatColumns={flatColumns}
                  height={HOUR_LABEL_H}
                  renderCell={(col) => <span className="text-[9px] font-mono" style={{ color: "#5F7D72" }}>{col.label}</span>}
                  renderEmptyDay={() => (
                    <button
                      type="button"
                      onClick={onOpenPreferences}
                      title="Sin horarios de cancha cargados para este dia. Cargalos en Preferencias."
                      className="text-[9px] font-bold underline-offset-2 hover:underline px-1 truncate"
                      style={{ color: "#B8860B", maxWidth: EMPTY_DAY_W - 8 }}
                    >
                      Sin horarios — ver Preferencias
                    </button>
                  )}
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
                        flatColumns={flatColumns}
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
                        flatColumns={flatColumns}
                        height={SMALL_ROW_H}
                        renderCell={(col) => {
                          const count = countPairsAvailableAtHour(row.block, col.dayKey, col.minutes);
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
                      flatColumns={flatColumns}
                      height={SMALL_ROW_H}
                      renderCell={(col) => {
                        const courts = getCourtsAvailableAtHour(col.dayKey, col.minutes);
                        const matches = countMatchesAtHour(col.dayKey, col.minutes);
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
