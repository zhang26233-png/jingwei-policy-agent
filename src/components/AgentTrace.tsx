import { Check, LoaderCircle } from 'lucide-react';

export function AgentTrace({ steps, activeStep }: { steps: string[]; activeStep: number }) {
  return (
    <div className="agent-trace" aria-label="智能体执行过程">
      {steps.map((step, index) => {
        const done = index < activeStep;
        const active = index === activeStep;
        return (
          <div className={`trace-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`} key={step}>
            <span className="trace-dot">
              {done ? (
                <Check size={11} />
              ) : active ? (
                <LoaderCircle size={11} className="spin" />
              ) : (
                String(index + 1).padStart(2, '0')
              )}
            </span>
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
