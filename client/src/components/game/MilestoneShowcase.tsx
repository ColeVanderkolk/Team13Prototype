import { useEffect } from "react";
import { MilestoneCard } from "@/lib/svg3d/MilestoneCard";
import { milestoneAssets, type MilestoneSymbol } from "@/lib/svg3d/assets";
import "./milestones.css";

export interface MilestoneShowcaseItem {
  svgKey: MilestoneSymbol;
  name: string;
  description: string;
}

interface Props {
  items: MilestoneShowcaseItem[];
  onDismiss: () => void;
}

export function MilestoneShowcase({ items, onDismiss }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (items.length === 0) return null;

  return (
    <div
      className="milestone-showcase"
      role="dialog"
      aria-modal="true"
      aria-label="Milestones unlocked"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <header className="milestone-showcase-header">
        <h2 className="milestone-showcase-title">Milestones Unlocked</h2>
        <p className="milestone-showcase-subtitle">
          {items.length} discovered
        </p>
      </header>
      <div className="milestone-showcase-grid">
        {items.map((item) => {
          const asset = milestoneAssets[item.svgKey];
          return (
            <div key={item.svgKey} className="milestone-card">
              <MilestoneCard svg={asset.markup} name={item.name} subtitle={item.description} />
            </div>
          );
        })}
      </div>
      <button type="button" className="milestone-showcase-done" onClick={onDismiss}>
        Done
      </button>
    </div>
  );
}
