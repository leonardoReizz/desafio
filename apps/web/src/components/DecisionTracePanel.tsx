"use client";
import { useState } from "react";
import { ChevronDown, Check, AlertCircle, RotateCcw } from "lucide-react";
import { ACTION_LABEL, INTENT_LABEL, type DecisionTrace, type TraceStep } from "@nexo/contracts";

export function TraceStepLine({ steps, pending = false }: { steps: TraceStep[]; pending?: boolean }) {
  return (
    <span className="trace-step-line">
      {steps.map((step) => (
        <span
          key={step.id}
          className={`trace-chip ${step.status}`}
          title={step.status === "recuperado" ? `recuperado após ${step.attempts} tentativas` : (step.detail ?? undefined)}
        >
          {pending ? (
            <span className="step-spinner" />
          ) : step.status === "erro" ? (
            <AlertCircle size={13} />
          ) : step.status === "recuperado" ? (
            <RotateCcw size={13} />
          ) : (
            <Check size={13} />
          )}{" "}
          {step.label}
        </span>
      ))}
    </span>
  );
}
export function DecisionTracePanel({
  trace,
  compact = false,
  label = "Nexo Assist",
  open: controlledOpen,
  onOpenChange,
  placement = "below",
}: {
  trace: DecisionTrace;
  compact?: boolean;
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: "above" | "below";
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const toggle = () => (onOpenChange ? onOpenChange(!open) : setInternalOpen(!open));
  const confidence = Math.round(trace.confidence * 100);
  const tone = confidence >= 75 ? "good" : confidence >= 55 ? "medium" : "low";
  return (
    <div className={`trace-wrapper ${compact ? "compact" : ""} ${placement}`}>
      <button type="button" className="trace-trigger" aria-expanded={open} onClick={toggle}>
        <strong>{label}</strong>
        <TraceStepLine steps={trace.steps} />
        <span className="trace-more">
          Ver por quê <ChevronDown size={14} className={open ? "rotated" : ""} />
        </span>
      </button>
      {open && (
        <div className="trace-panel">
          <div className="trace-panel-title">Por que o assistente fez isso</div>
          <div className="trace-grid">
            <div>
              <span className="eyebrow">O que entendi · {INTENT_LABEL[trace.intent]}</span>
              <p>{trace.understood}</p>
            </div>
            <div>
              <span className="eyebrow">O que fiz</span>
              <p>{ACTION_LABEL[trace.action]}</p>
            </div>
          </div>
          <div className="confidence">
            <span className="eyebrow">Confiança</span>
            <strong className={tone}>{confidence}%</strong>
            <span className="confidence-track">
              <span className={tone} style={{ width: `${confidence}%` }} />
            </span>
          </div>
          <div className="trace-section">
            <span className="eyebrow">Por quê</span>
            <p>{trace.rationale}</p>
          </div>
          {trace.rulesApplied.length > 0 && (
            <div className="trace-section">
              <span className="eyebrow">Regras aplicadas</span>
              <ul>
                {trace.rulesApplied.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="trace-section">
            <span className="eyebrow">Ferramentas</span>
            <div className="tool-list">
              {trace.steps.length ? (
                trace.steps.map((step) => (
                  <div key={step.id} className="tool-row">
                    <div>
                      <strong>{step.label}</strong>
                      <code>{step.tool}</code>
                    </div>
                    <small>
                      {step.durationMs} ms · {step.attempts} {step.attempts === 1 ? "tentativa" : "tentativas"}
                    </small>
                    {step.detail && <p>{step.detail}</p>}
                  </div>
                ))
              ) : (
                <p>Nenhuma ferramenta usada.</p>
              )}
            </div>
          </div>
          {trace.guardrails.length > 0 && (
            <div className="trace-section">
              <span className="eyebrow">Guardrails</span>
              <ul>
                {trace.guardrails.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="trace-foot">
            {trace.model} · {trace.latencyMs} ms{trace.usage && ` · ${trace.usage.inputTokens + trace.usage.outputTokens} tokens`}
          </div>
        </div>
      )}
    </div>
  );
}
