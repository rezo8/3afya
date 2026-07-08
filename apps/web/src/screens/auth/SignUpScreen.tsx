import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signUp } from "@/lib/auth/auth-client";

export function SignUpScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await signUp.email({ name, email, password });
    setBusy(false);
    if (error) {
      setError(error.message ?? "Could not create your account.");
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="ar">عافية</div>
        <div className="tag">3afya · start tracking</div>
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Create account</h1>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="auth-alt">
          Already have one? <Link to="/sign-in">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
