"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrizePilotStore } from "lib/usePrizePilotStore";

export default function SuccessClient({ plan }) {
  const { setPlan } = usePrizePilotStore();
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function applyPlan() {
      await setPlan(plan);
      setDone(true);
    }

    applyPlan();
  }, [plan, setPlan]);

  return (
    <div className="auth-body">
      <div className="auth-shell">
        <section className="auth-panel auth-panel--intro">
          <div className="brand-mark">
            <span className="brand-mark__badge"></span>
            <span>PrizePilot</span>
          </div>
          <p className="eyebrow">Billing success</p>
          <h1>Your plan update is on the board.</h1>
          <p>
            {done
              ? `The ${plan} plan is now active in your workspace.`
              : "Applying your plan change..."}
          </p>
        </section>

        <section className="auth-panel">
          <h2>Next step</h2>
          <p>Head back to billing or jump into the dashboard to keep building.</p>
          <div className="studio-actions">
            <Link className="button" href="/billing">
              Back to billing
            </Link>
            <Link className="button button--ghost" href="/dashboard">
              Open dashboard
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
