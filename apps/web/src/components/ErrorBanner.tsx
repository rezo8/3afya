export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span className="eb-text">{message}</span>
      {onRetry && (
        <button className="eb-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
