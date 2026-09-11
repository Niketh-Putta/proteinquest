export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="login-shell">
      <div className="login-glow" />
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <img src="/proteinquest-logo.png" width="60" height="60" alt="ProteinQuest logo" />
          <strong>
            Protein<b>Quest</b>
          </strong>
        </div>
        <div className="login-copy">
          <span className="login-kicker">Admin dashboard</span>
          <h1 id="login-title">Welcome back.</h1>
          <p>Sign in to view ProteinQuest growth, conversion and revenue.</p>
        </div>
        <form className="login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={params.next || "/"} />
          <label>
            <span>Email</span>
            <input type="email" autoComplete="username" required autoFocus name="email" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" required name="password" />
          </label>
          {params.error ? <p className="login-error">Those credentials were rejected.</p> : null}
          <button type="submit">Sign in</button>
        </form>
        <p className="login-foot">Owner access only · session expires after 8 hours</p>
      </section>
    </main>
  );
}
