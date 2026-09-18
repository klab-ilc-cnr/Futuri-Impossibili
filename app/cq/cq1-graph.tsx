"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dictionaries, type Lang } from "../strings";
import {
  type CqEntry,
  type CqInterview,
  type CqPolarity,
  type TextTurn,
  buildRespondentTurns,
  metadataPropertyValues,
  polarityNames,
  polarityOrder,
  readErrorDetail,
  readResourceIdentifier,
  referringConceptProperty,
  rdfsCommentProperty,
  textsEndpoint,
} from "./shared";

const graphSectorTop = 8;
const graphNeighborTop = 5;
const graphMinWeight = 1;
const graphMinZoom = 0.4;
const graphMaxZoom = 4;
const nodeRadiusMin = 7;
const nodeRadiusSpan = 11;
const ringBaseRadius = 84;
const ringStep = 80;
const ringSpacing = 34;
const labelMaxChars = 18;
const labelFontSize = 11.5;
const labelCharWidth = 0.56;
const sectorLabelMargin = 36;
const graphPadding = 28;

export interface Cq1GraphSelection {
  concept: string;
  label: string;
  kind: "narrative" | "paradigmatic";
  polarity?: CqPolarity;
}

interface Cq1GraphProps {
  entry: CqEntry;
  narrative: Array<{ concept: string; label: string; polarity: CqPolarity }>;
  paradigmatic: Array<{ concept: string; label: string }>;
  polarities: Set<CqPolarity>;
  lang: Lang;
  selectedConcept: { concept: string; kind: string } | null;
  highlightConcept: string | null;
  ensureCaches: () => Promise<{ corpus: Map<string, Record<string, unknown>[]>; interviews: CqInterview[] }>;
  onSelectConcept: (selection: Cq1GraphSelection) => void;
  onClearHighlight: () => void;
  onBackToList: () => void;
}

interface GraphNode {
  concept: string;
  label: string;
  kind: "narrative" | "paradigmatic";
  polarity?: CqPolarity;
  occurrences: number;
  interviewees: number;
  x: number;
  y: number;
  radius: number;
  labelVisible: boolean;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "end";
}

interface GraphEdge {
  a: string;
  b: string;
  weight: number;
  fallbackWeight: number;
  documents: number;
}

interface GraphSector {
  key: string;
  polarity: CqPolarity | null;
  angle: number;
  hidden: number;
  labelRadius: number;
  label: string;
}

interface GraphBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hiddenCount: number;
  sectors: GraphSector[];
  bbox: GraphBBox;
}

interface GraphTooltip {
  title: string;
  lines: string[];
  tone: string;
}

interface GraphEmphasis {
  nodes: Set<string>;
  edges: Set<string>;
  accent: boolean;
}

function edgeKeyOf(edge: GraphEdge): string {
  return `${edge.a}|${edge.b}`;
}

function observableTypesOf(item: Record<string, unknown>): string[] {
  const raw = item.observableTypes;
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function unitKeyOf(fileId: string, start: number, turns: TextTurn[]): string {
  if (!Number.isFinite(start) || turns.length === 0) return `doc:${fileId}`;
  let low = 0;
  let high = turns.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (turns[middle].start <= start) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0 || start >= turns[found].end) return `doc:${fileId}`;
  return `turn:${fileId}:${found}`;
}

function sectorKeyOf(polarity: CqPolarity | undefined): string {
  return polarity ?? "paradigmatic";
}

interface BuildGraphParams {
  entry: CqEntry;
  narrative: Array<{ concept: string; label: string; polarity: CqPolarity }>;
  paradigmatic: Array<{ concept: string; label: string }>;
  polarities: Set<CqPolarity>;
  corpus: Map<string, Record<string, unknown>[]>;
  texts: Map<string, string>;
  sectorLabels: Record<string, string>;
}

function buildGraph({ entry, narrative, paradigmatic, polarities, corpus, texts, sectorLabels }: BuildGraphParams): GraphPayload {
  const conceptMeta = new Map<string, { label: string; kind: "narrative" | "paradigmatic"; polarity?: CqPolarity }>();
  for (const item of paradigmatic) {
    if (!conceptMeta.has(item.concept)) {
      conceptMeta.set(item.concept, { label: item.label, kind: "paradigmatic" });
    }
  }
  for (const item of narrative) {
    conceptMeta.set(item.concept, { label: item.label, kind: "narrative", polarity: item.polarity });
  }

  const term = entry.label.trim().toLocaleLowerCase("it");
  const senses = new Set(entry.senses);
  const turnsByFile = new Map<string, TextTurn[]>();
  for (const [fileId, text] of texts) turnsByFile.set(fileId, buildRespondentTurns(text));

  const occurrences = new Map<string, number>();
  const intervieweeSets = new Map<string, Set<string>>();
  const units = new Map<string, { fileId: string; concepts: Set<string> }>();

  for (const [fileId, items] of corpus) {
    const turns = turnsByFile.get(fileId) ?? [];
    for (const item of items) {
      const types = observableTypesOf(item);
      let concept = "";
      if (types.some((type) => type.includes("LexicalConcept"))) {
        const comment = metadataPropertyValues(item.metadata, rdfsCommentProperty)[0] ?? "";
        if (comment.trim().toLocaleLowerCase("it") !== term) continue;
        concept = readResourceIdentifier(item.observable);
      } else if (types.some((type) => type.includes("LexicalSense"))) {
        const observable = readResourceIdentifier(item.observable);
        if (!senses.has(observable)) continue;
        concept = metadataPropertyValues(item.metadata, referringConceptProperty)[0] ?? "";
      } else {
        continue;
      }
      if (!concept || !conceptMeta.has(concept)) continue;
      occurrences.set(concept, (occurrences.get(concept) ?? 0) + 1);
      if (!intervieweeSets.has(concept)) intervieweeSets.set(concept, new Set());
      intervieweeSets.get(concept)?.add(fileId);
      const unitKey = unitKeyOf(fileId, Number(item.start), turns);
      const unit = units.get(unitKey) ?? { fileId, concepts: new Set<string>() };
      unit.concepts.add(concept);
      units.set(unitKey, unit);
    }
  }

  const pairWeight = new Map<string, number>();
  const pairFallback = new Map<string, number>();
  const pairDocuments = new Map<string, Set<string>>();
  for (const [unitKey, unit] of units) {
    const list = [...unit.concepts].sort((left, right) => left.localeCompare(right));
    const fallback = unitKey.startsWith("doc:");
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const pairKey = `${list[i]}|${list[j]}`;
        pairWeight.set(pairKey, (pairWeight.get(pairKey) ?? 0) + 1);
        if (fallback) pairFallback.set(pairKey, (pairFallback.get(pairKey) ?? 0) + 1);
        if (!pairDocuments.has(pairKey)) pairDocuments.set(pairKey, new Set());
        pairDocuments.get(pairKey)?.add(unit.fileId);
      }
    }
  }

  const allNodes: GraphNode[] = [];
  for (const [concept, meta] of conceptMeta) {
    if (meta.kind === "narrative" && meta.polarity && !polarities.has(meta.polarity)) continue;
    allNodes.push({
      concept,
      label: meta.label,
      kind: meta.kind,
      polarity: meta.polarity,
      occurrences: occurrences.get(concept) ?? 0,
      interviewees: intervieweeSets.get(concept)?.size ?? 0,
      x: 0,
      y: 0,
      radius: nodeRadiusMin,
      labelVisible: false,
      labelX: 0,
      labelY: 0,
      labelAnchor: "start",
    });
  }

  const maxOccurrences = Math.max(1, ...allNodes.map((node) => node.occurrences));
  const sectorKeys = [...polarityOrder.filter((polarity) => polarities.has(polarity)), "paradigmatic"];
  const span = (2 * Math.PI) / Math.max(1, sectorKeys.length);
  const nodes: GraphNode[] = [];
  const sectors: GraphSector[] = [];
  let hiddenCount = 0;

  sectorKeys.forEach((key, sectorIndex) => {
    const group = allNodes
      .filter((node) => sectorKeyOf(node.polarity) === key)
      .sort((left, right) => right.occurrences - left.occurrences || left.label.localeCompare(right.label, "it"));
    const visible = group.slice(0, graphSectorTop);
    hiddenCount += group.length - visible.length;
    const angle = -Math.PI / 2 + sectorIndex * span;
    const half = (span / 2) * 0.88;
    let index = 0;
    let ring = 0;
    let sectorMaxRadius = 0;
    while (index < visible.length && ring < 10) {
      const radius = ringBaseRadius + ring * ringStep;
      const capacity = Math.max(1, Math.floor((2 * half * radius) / ringSpacing));
      for (let slot = 0; slot < capacity && index < visible.length; slot += 1, index += 1) {
        const slotAngle = angle + 2 * half * ((slot + 0.5) / capacity - 0.5);
        const node = visible[index];
        const nodeRadius = nodeRadiusMin + nodeRadiusSpan * Math.sqrt(node.occurrences / maxOccurrences);
        nodes.push({
          ...node,
          x: Math.cos(slotAngle) * radius,
          y: Math.sin(slotAngle) * radius,
          radius: nodeRadius,
        });
        sectorMaxRadius = Math.max(sectorMaxRadius, radius + nodeRadius);
      }
      ring += 1;
    }
    sectors.push({
      key,
      polarity: key === "paradigmatic" ? null : (key as CqPolarity),
      angle,
      hidden: group.length - visible.length,
      labelRadius: sectorMaxRadius,
      label: sectorLabels[key] ?? key,
    });
  });

  // Etichette dei nodi con evitamento deterministico delle collisioni:
  // si etichettano prima i concetti con più occorrenze, si salta chi si sovrappone.
  const occupied: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const labelOrder = [...nodes].sort(
    (left, right) => right.occurrences - left.occurrences
      || right.radius - left.radius
      || left.label.localeCompare(right.label, "it"),
  );
  for (const node of labelOrder) {
    const direction = Math.atan2(node.y, node.x);
    const cos = Math.cos(direction);
    const sin = Math.sin(direction);
    const anchor: "start" | "end" = cos >= 0 ? "start" : "end";
    const x = node.x + (node.radius + 5) * cos;
    const y = node.y + (node.radius + 5) * sin;
    const text = truncateLabel(node.label);
    const width = text.length * labelCharWidth * labelFontSize;
    const height = labelFontSize * 1.2;
    const rect = anchor === "start"
      ? { x1: x, y1: y - height / 2, x2: x + width, y2: y + height / 2 }
      : { x1: x - width, y1: y - height / 2, x2: x, y2: y + height / 2 };
    const collides = occupied.some((other) => (
      rect.x1 < other.x2 + 3 && rect.x2 > other.x1 - 3
      && rect.y1 < other.y2 + 2 && rect.y2 > other.y1 - 2
    ));
    node.labelVisible = !collides;
    node.labelAnchor = anchor;
    node.labelX = x;
    node.labelY = y;
    if (!collides) occupied.push(rect);
  }

  // Il titolo di settore va subito oltre il proprio grappolo, misurato lungo
  // l'asse del settore (proiezione), non in distanza euclidea.
  for (const sector of sectors) {
    const axisX = Math.cos(sector.angle);
    const axisY = Math.sin(sector.angle);
    let projection = 0;
    for (const node of nodes) {
      if (sectorKeyOf(node.polarity) !== sector.key) continue;
      projection = Math.max(projection, node.x * axisX + node.y * axisY + node.radius);
      if (!node.labelVisible) continue;
      const text = truncateLabel(node.label);
      const width = text.length * labelCharWidth * labelFontSize;
      const outerX = node.labelAnchor === "start" ? node.labelX + width : node.labelX - width;
      projection = Math.max(
        projection,
        node.labelX * axisX + node.labelY * axisY,
        outerX * axisX + node.labelY * axisY,
      );
    }
    sector.labelRadius = projection + sectorLabelMargin;
  }

  const visibleConcept = new Set(nodes.map((node) => node.concept));
  const candidateEdges: GraphEdge[] = [];
  for (const [pairKey, weight] of pairWeight) {
    if (weight < graphMinWeight) continue;
    const [a, b] = pairKey.split("|");
    if (!visibleConcept.has(a) || !visibleConcept.has(b)) continue;
    candidateEdges.push({
      a,
      b,
      weight,
      fallbackWeight: pairFallback.get(pairKey) ?? 0,
      documents: pairDocuments.get(pairKey)?.size ?? 0,
    });
  }

  const incident = new Map<string, GraphEdge[]>();
  for (const edge of candidateEdges) {
    for (const concept of [edge.a, edge.b]) {
      if (!incident.has(concept)) incident.set(concept, []);
      incident.get(concept)?.push(edge);
    }
  }
  const kept = new Set<string>();
  for (const list of incident.values()) {
    list.sort((left, right) => right.weight - left.weight || left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
    for (const edge of list.slice(0, graphNeighborTop)) kept.add(`${edge.a}|${edge.b}`);
  }
  const edges = candidateEdges.filter((edge) => kept.has(`${edge.a}|${edge.b}`));

  // bounding box del contenuto (nodi, etichette visibili, etichette di settore)
  const bbox: GraphBBox = { minX: -34, minY: -34, maxX: 34, maxY: 34 };
  const extend = (x1: number, y1: number, x2: number, y2: number) => {
    bbox.minX = Math.min(bbox.minX, x1);
    bbox.minY = Math.min(bbox.minY, y1);
    bbox.maxX = Math.max(bbox.maxX, x2);
    bbox.maxY = Math.max(bbox.maxY, y2);
  };
  for (const node of nodes) {
    extend(node.x - node.radius, node.y - node.radius, node.x + node.radius, node.y + node.radius);
    if (!node.labelVisible) continue;
    const text = truncateLabel(node.label);
    const width = text.length * labelCharWidth * labelFontSize;
    const height = labelFontSize * 1.2;
    const left = node.labelAnchor === "start" ? node.labelX : node.labelX - width;
    extend(left, node.labelY - height / 2, left + width, node.labelY + height / 2);
  }
  for (const sector of sectors) {
    const width = sector.label.length * 0.62 * 12;
    const x = Math.cos(sector.angle) * sector.labelRadius;
    const y = Math.sin(sector.angle) * sector.labelRadius;
    const left = Math.cos(sector.angle) > 0.35 ? x : Math.cos(sector.angle) < -0.35 ? x - width : x - width / 2;
    extend(left, y - 12, left + width, y + 12);
  }

  return { nodes, edges, hiddenCount, sectors, bbox };
}

function truncateLabel(label: string): string {
  return label.length > labelMaxChars ? `${label.slice(0, labelMaxChars - 1)}…` : label;
}

export function Cq1NetworkGraph({
  entry,
  narrative,
  paradigmatic,
  polarities,
  lang,
  selectedConcept,
  highlightConcept,
  ensureCaches,
  onSelectConcept,
  onClearHighlight,
  onBackToList,
}: Cq1GraphProps) {
  const t = dictionaries[lang];
  const numberLocale = lang === "en" ? "en-US" : "it-IT";

  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinnedTooltip, setPinnedTooltip] = useState<GraphTooltip | null>(null);
  const [hoverTarget, setHoverTarget] = useState<{ kind: "edge" | "node"; key: string } | null>(null);
  const [pinnedTarget, setPinnedTarget] = useState<{ kind: "edge" | "node"; key: string } | null>(null);

  const sectorLabels = useMemo(() => ({
    positive: polarityNames.positive(t),
    neutral: polarityNames.neutral(t),
    negative: polarityNames.negative(t),
    paradigmatic: t.cq1.graphSectorParadigmatic,
  }), [t]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [box, setBox] = useState({ width: 0, height: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      setLoading(true);
      setError("");
      try {
        const [{ corpus }, textsResponse] = await Promise.all([
          ensureCaches(),
          fetch(`${textsEndpoint}/corpus`, { headers: { Accept: "application/json" }, cache: "no-store" }),
        ]);
        if (!textsResponse.ok) throw new Error(await readErrorDetail(textsResponse));
        const textsPayload = await textsResponse.json() as { texts?: Record<string, unknown> };
        const texts = new Map<string, string>();
        for (const [fileId, value] of Object.entries(textsPayload.texts ?? {})) {
          if (typeof value === "string") texts.set(fileId, value);
        }
        if (cancelled) return;
        setPayload(buildGraph({ entry, narrative, paradigmatic, polarities, corpus, texts, sectorLabels }));
        setPinnedTarget(null);
        setPinnedTooltip(null);
        setHoverTarget(null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : t.cq1.loading);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void build();
    return () => { cancelled = true; };
  }, [entry, narrative, paradigmatic, polarities, ensureCaches, sectorLabels, t]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => ({
        ...current,
        k: Math.min(graphMaxZoom, Math.max(graphMinZoom, current.k * (event.deltaY < 0 ? 1.12 : 0.89))),
      }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [loading]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => setBox({ width: svg.clientWidth, height: svg.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [loading]);

  const viewBox = useMemo(() => {
    if (!payload) return "-460 -400 920 800";
    const { minX, minY, maxX, maxY } = payload.bbox;
    let halfWidth = (maxX - minX) / 2 + graphPadding;
    let halfHeight = (maxY - minY) / 2 + graphPadding;
    const aspect = box.width > 0 && box.height > 0 ? box.width / box.height : 1.35;
    if (halfWidth / halfHeight < aspect) halfWidth = halfHeight * aspect;
    else halfHeight = halfWidth / aspect;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return `${centerX - halfWidth} ${centerY - halfHeight} ${2 * halfWidth} ${2 * halfHeight}`;
  }, [payload, box]);

  const nodeByConcept = useMemo(
    () => new Map((payload?.nodes ?? []).map((node) => [node.concept, node])),
    [payload],
  );

  const neighbors = useMemo(() => {
    const map = new Map<string, Array<{ concept: string; weight: number }>>();
    for (const edge of payload?.edges ?? []) {
      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        if (!map.has(from)) map.set(from, []);
        map.get(from)?.push({ concept: to, weight: edge.weight });
      }
    }
    for (const list of map.values()) list.sort((left, right) => right.weight - left.weight);
    return map;
  }, [payload]);

  const pinnedEdgeData = useMemo(
    () => (pinnedTarget?.kind === "edge"
      ? (payload?.edges ?? []).find((edge) => edgeKeyOf(edge) === pinnedTarget.key) ?? null
      : null),
    [payload, pinnedTarget],
  );

  const hoverEdgeData = useMemo(
    () => (hoverTarget?.kind === "edge"
      ? (payload?.edges ?? []).find((edge) => edgeKeyOf(edge) === hoverTarget.key) ?? null
      : null),
    [payload, hoverTarget],
  );

  const emphasis = useMemo<GraphEmphasis | null>(() => {
    const edge = pinnedEdgeData ?? hoverEdgeData;
    if (edge) {
      return { nodes: new Set([edge.a, edge.b]), edges: new Set([edgeKeyOf(edge)]), accent: true };
    }
    const activeNode = pinnedTarget?.kind === "node"
      ? pinnedTarget.key
      : hoverTarget?.kind === "node" ? hoverTarget.key : null;
    if (activeNode) {
      const concept = activeNode;
      const incident = (payload?.edges ?? []).filter((item) => item.a === concept || item.b === concept);
      const nodes = new Set<string>([concept]);
      for (const item of incident) {
        nodes.add(item.a);
        nodes.add(item.b);
      }
      return { nodes, edges: new Set(incident.map(edgeKeyOf)), accent: true };
    }
    if (highlightConcept) {
      const nodes = new Set<string>([
        highlightConcept,
        ...(neighbors.get(highlightConcept) ?? []).map((item) => item.concept),
      ]);
      const edges = new Set(
        (payload?.edges ?? [])
          .filter((item) => nodes.has(item.a) && nodes.has(item.b))
          .map(edgeKeyOf),
      );
      return { nodes, edges, accent: false };
    }
    return null;
  }, [pinnedEdgeData, hoverEdgeData, hoverTarget, pinnedTarget, highlightConcept, neighbors, payload]);

  const nodeLines = useCallback((node: GraphNode) => {
    const lines: string[] = [];
    lines.push(node.polarity
      ? `${t.cq1.detailPolarity}: ${polarityNames[node.polarity](t)}`
      : t.cq1.graphSectorParadigmatic);
    lines.push(`${t.cq1.detailOccurrences}: ${node.occurrences.toLocaleString(numberLocale)}`);
    lines.push(`${t.cq1.detailInterviewees}: ${node.interviewees.toLocaleString(numberLocale)}`);
    const top = (neighbors.get(node.concept) ?? []).slice(0, graphNeighborTop);
    if (top.length === 0) {
      lines.push(t.cq1.graphNodeIsolated);
    } else {
      lines.push(`${t.cq1.graphNodeTopCooccurring}:`);
      for (const item of top) {
        lines.push(`${nodeByConcept.get(item.concept)?.label ?? item.concept} · ${item.weight.toLocaleString(numberLocale)}`);
      }
    }
    return lines;
  }, [neighbors, nodeByConcept, numberLocale, t]);

  const clearHover = () => {
    setHoverTarget(null);
  };

  const togglePin = (kind: "edge" | "node", key: string, title: string, lines: string[], tone: string) => {
    if (dragRef.current.moved) return;
    if (pinnedTarget?.kind === kind && pinnedTarget.key === key) {
      setPinnedTarget(null);
      setPinnedTooltip(null);
      return;
    }
    setPinnedTarget({ kind, key });
    setPinnedTooltip({ title, lines, tone });
  };

  const unpin = () => {
    setPinnedTarget(null);
    setPinnedTooltip(null);
  };

  useEffect(() => {
    if (!pinnedTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") unpin();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pinnedTarget]);

  if (loading) return <p className="cq-status">{t.cq1.graphLoading}</p>;
  if (error) return <p className="cq-status cq-status-error">{t.cq1.errorPrefix}{error}</p>;
  if (!payload || payload.nodes.length === 0) return <p className="cq-panel-empty">{t.cq1.graphEmpty}</p>;


  return (
    <div className="cq-graph" ref={wrapperRef}>
      <div className="cq-graph-toolbar">
        <button type="button" className="cq-show-toggle" onClick={onBackToList}>
          ‹ {t.cq1.graphBackToList}
        </button>
        <button type="button" className="cq-show-toggle" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
          {t.cq1.graphFit}
        </button>
        {highlightConcept && (
          <button type="button" className="cq-show-toggle" onClick={onClearHighlight}>
            {t.cq1.clearHighlight}
          </button>
        )}
        {payload.hiddenCount > 0 && (
          <span className="cq-graph-note">{t.cq1.graphHidden(payload.hiddenCount)}</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="cq-graph-svg"
        role="img"
        aria-label={t.cq1.graphTitle}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          dragRef.current = {
            active: true,
            moved: false,
            startX: event.clientX,
            startY: event.clientY,
            originX: view.x,
            originY: view.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag.active) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
          setView((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
          window.setTimeout(() => { dragRef.current.moved = false; }, 0);
        }}
        onPointerLeave={() => { dragRef.current.active = false; }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || !pinnedTarget) return;
          unpin();
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {payload.sectors.map((sector) => {
            const cosine = Math.cos(sector.angle);
            const anchor = cosine > 0.35 ? "start" : cosine < -0.35 ? "end" : "middle";
            return (
            <text
              key={`sector-${sector.key}`}
              className={`cq-graph-sector cq-graph-sector-${sector.polarity ?? "paradigmatic"}`}
              x={cosine * sector.labelRadius}
              y={Math.sin(sector.angle) * sector.labelRadius}
              textAnchor={anchor}
            >
              {sector.label}
            </text>
            );
          })}

          {payload.edges.map((edge) => {
            const from = nodeByConcept.get(edge.a);
            const to = nodeByConcept.get(edge.b);
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const distance = Math.hypot(midX, midY) || 1;
            const bulge = Math.min(1.7, 1.2 + 42 / distance);
            const controlX = midX * bulge;
            const controlY = midY * bulge;
            const key = edgeKeyOf(edge);
            const dimmed = emphasis ? !emphasis.edges.has(key) : false;
            const active = emphasis ? emphasis.accent && emphasis.edges.has(key) : false;
            const unit = edge.fallbackWeight > 0 && edge.fallbackWeight === edge.weight
              ? t.cq1.graphUnitDocuments
              : t.cq1.graphUnitTurns;
            const lines = [
              `${t.cq1.graphTooltipEdgeForce}: ${edge.weight.toLocaleString(numberLocale)}`,
              `${t.cq1.graphTooltipEdgeUnit}: ${unit}`,
              `${t.cq1.graphTooltipDocuments}: ${edge.documents.toLocaleString(numberLocale)}`,
            ];
            if (edge.fallbackWeight > 0 && edge.fallbackWeight !== edge.weight) {
              lines.push(`${t.cq1.graphUnitDocuments}: ${edge.fallbackWeight.toLocaleString(numberLocale)}`);
            }
            const title = `${from.label} ↔ ${to.label}`;
            const path = `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
            return (
              <g key={`edge-${key}`}>
                <path
                  className={["cq-graph-edge", dimmed ? "dimmed" : "", active ? "active" : ""].filter(Boolean).join(" ")}
                  style={{ strokeWidth: 1.4 + (edge.weight - 1) * 1.1, opacity: Math.min(0.9, 0.45 + edge.weight * 0.15) }}
                  d={path}
                />
                <path
                  className="cq-graph-edge-hit"
                  d={path}
                  onMouseEnter={() => {
                    if (pinnedTarget) return;
                    setHoverTarget({ kind: "edge", key });
                  }}
                  onMouseLeave={() => { if (!pinnedTarget) clearHover(); }}
                  onClick={() => togglePin("edge", key, title, lines, "edge")}
                />
              </g>
            );
          })}

          <g className="cq-graph-entry">
            <circle cx={0} cy={0} r={26} />
            <text x={0} y={0} dy="0.35em" textAnchor="middle">{truncateLabel(entry.label)}</text>
          </g>

          {payload.nodes.map((node) => {
            const selected = selectedConcept?.concept === node.concept;
            const dimmed = emphasis ? !emphasis.nodes.has(node.concept) : false;
            const lit = Boolean(emphasis?.nodes.has(node.concept));
            return (
              <g
                key={node.concept}
                className={[
                  "cq-graph-node",
                  node.polarity ? `cq-graph-node-${node.polarity}` : "cq-graph-node-paradigmatic",
                  selected ? "selected" : "",
                  lit ? "lit" : "",
                  dimmed ? "dimmed" : "",
                ].filter(Boolean).join(" ")}
                onMouseEnter={() => {
                  if (pinnedTarget) return;
                  setHoverTarget({ kind: "node", key: node.concept });
                }}
                onMouseLeave={clearHover}
                onClick={() => {
                  if (dragRef.current.moved) return;
                  onSelectConcept({
                    concept: node.concept,
                    label: node.label,
                    kind: node.kind,
                    polarity: node.polarity,
                  });
                  togglePin("node", node.concept, node.label, nodeLines(node), node.polarity ?? "paradigmatic");
                }}
              >
                <circle cx={node.x} cy={node.y} r={node.radius} />
                {node.labelVisible && (
                  <text x={node.labelX} y={node.labelY} textAnchor={node.labelAnchor} dominantBaseline="middle">
                    {truncateLabel(node.label)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {payload.edges.length === 0 && <p className="cq-panel-empty">{t.cq1.graphNoEdges}</p>}

      {pinnedTooltip && (
        <div className={`cq-graph-tooltip pinned cq-graph-tooltip-${pinnedTooltip.tone}`} role="tooltip">
          <button
            type="button"
            className="cq-graph-tooltip-close"
            aria-label={t.cq1.graphTooltipClose}
            onClick={unpin}
          >
            ×
          </button>
          <p className="cq-graph-tooltip-title">{pinnedTooltip.title}</p>
          {pinnedTooltip.lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
        </div>
      )}
    </div>
  );
}
