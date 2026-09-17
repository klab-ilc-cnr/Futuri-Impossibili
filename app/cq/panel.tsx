"use client";

import { useState } from "react";
import { dictionaries, type Lang } from "../strings";
import { Cq1Panel } from "./cq1";
import { Cq2Panel } from "./cq2";
import { Cq3Panel } from "./cq3";
import {
  cqExampleParams,
  renderCqSparql,
  type CqQueryId,
} from "./sparql";

type CqCardId = "cq1" | "cq2" | "cq3";

interface CqCard {
  id: CqCardId;
  title: string;
  query: string;
  sparqlId: CqQueryId;
  available: boolean;
}

const cardNotes: Partial<Record<CqCardId, (t: (typeof dictionaries)["it"]) => string>> = {
  cq2: (t) => t.cq.cq2PreviewNote,
};

const cqCards: Array<CqCard> = [
  {
    id: "cq1",
    title: "CQ1 – Concepts by polarity",
    query: "Which concepts are associated with the narrative senses of a given lexical entry, by polarity?",
    sparqlId: "cq1-narrative-concepts-by-polarity",
    available: true,
  },
  {
    id: "cq2",
    title: "CQ2 – Corpus evidence",
    query: "Retrieve all corpus passages in which a narrative sense of a given lexical entry is associated with a concept of a specified polarity.",
    sparqlId: "cq1-concept-detail",
    available: true,
  },
  {
    id: "cq3",
    title: "CQ3 – Speaker variation",
    query: "How does the distribution of one or more narrative concepts associated with a given lexical entry vary across speakers' age and gender?",
    sparqlId: "cq1-concept-detail",
    available: true,
  },
];

export function CqPanel({ lang }: { lang: Lang }) {
  const t = dictionaries[lang];
  const [selectedCq, setSelectedCq] = useState<CqCardId | null>(null);
  const [openCq, setOpenCq] = useState<CqCardId | null>(null);

  const selectedCard = cqCards.find((card) => card.id === selectedCq) ?? null;
  const previewSparql = selectedCard
    ? renderCqSparql(selectedCard.sparqlId, cqExampleParams[selectedCard.sparqlId])
    : "";

  if (openCq === "cq1") {
    return <Cq1Panel lang={lang} onBack={() => setOpenCq(null)} />;
  }

  if (openCq === "cq2") {
    return <Cq2Panel lang={lang} onBack={() => setOpenCq(null)} />;
  }

  if (openCq === "cq3") {
    return <Cq3Panel lang={lang} onBack={() => setOpenCq(null)} />;
  }

  if (openCq) {
    const openedCard = cqCards.find((card) => card.id === openCq);
    return (
      <section className="cq-page cq-in-progress" aria-labelledby="cq-in-progress-title">
        <button
          type="button"
          className="cq-back"
          onClick={() => setOpenCq(null)}
        >
          ‹ {t.cq.backToCards}
        </button>
        <p className="section-kicker">{t.cq.kicker}</p>
        <h2 id="cq-in-progress-title">
          {openedCard?.title} — {t.cq.panelInProgressTitle}
        </h2>
        <p>{t.cq.panelInProgressBody}</p>
      </section>
    );
  }

  return (
    <section className="cq-page" aria-labelledby="cq-title">
      <header className="cq-hero">
        <p className="section-kicker">{t.cq.kicker}</p>
        <h2 id="cq-title">{t.cq.title}</h2>
        <p>{t.cq.intro}</p>
      </header>

      <div className="cq-cards">
        {cqCards.map((card) => (
          <article
            key={card.id}
            role="button"
            tabIndex={card.available ? 0 : -1}
            onKeyDown={(event) => {
              if (card.available && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setSelectedCq(card.id);
                setOpenCq(card.id);
              }
            }}
            onClick={() => {
              setSelectedCq(card.id);
              if (card.available) setOpenCq(card.id);
            }}
            className={[
              "cq-card",
              "clickable",
              selectedCq === card.id ? "selected" : "",
              card.available ? "" : "unavailable",
            ].filter(Boolean).join(" ")}
          >
            <p className="cq-card-kicker">{card.id.toUpperCase()}</p>
            <h3>{card.title}</h3>
            <p className="cq-card-query">{card.query}</p>
            {card.available ? (
              <div className="cq-card-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedCq(card.id);
                  }}
                  aria-pressed={selectedCq === card.id}
                >
                  {t.cq.viewQuery}
                </button>
              </div>
            ) : (
              <p className="cq-soon" title={t.cq.comingSoonTitle}>{t.cq.comingSoon}</p>
            )}
          </article>
        ))}
      </div>

      <div className="cq-lower">
        <div className="cq-preview" aria-live="polite">
          <h3>{t.cq.queryPreview}</h3>
          {selectedCard ? (
            <>
              <p className="cq-preview-question">
                <span className="cq-preview-label">{t.cq.naturalLanguage}</span>
                {selectedCard.query}
              </p>
              <p className="cq-preview-label">{t.cq.sparqlLabel}</p>
              {cardNotes[selectedCard.id]?.(t) && (
                <p className="cq-preview-note">{cardNotes[selectedCard.id]!(t)}</p>
              )}
              <pre className="cq-sparql">{previewSparql}</pre>
            </>
          ) : (
            <p className="cq-preview-empty">{t.cq.queryPreviewEmpty}</p>
          )}
        </div>

        <aside className="cq-about">
          <h3>{t.cq.aboutTitle}</h3>
          <ul>
            <li>{t.cq.aboutData}</li>
            <li>{t.cq.aboutViewQuery}</li>
            <li>{t.cq.aboutOpenPanel}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

