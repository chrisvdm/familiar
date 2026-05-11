export const Contact = ({
  request,
}: {
  request: Request;
}) => {
  const url = new URL(request.url);
  const sent = url.searchParams.get("sent") === "1";

  return (
    <main className="page">
      <div className="page__shell">
        <section className="contact-hero">
          <p className="contact-eyebrow">Get in touch</p>
          <h1 className="contact-title">Contact us</h1>
          <p className="contact-copy">
            Questions, feedback, or just want to say hello? We&apos;d love to hear from you.
          </p>
        </section>

        {sent && (
          <div
            style={{
              margin: "0 auto 32px",
              maxWidth: "720px",
              padding: "16px 24px",
              borderRadius: "4px",
              background: "rgba(74, 222, 128, 0.12)",
              color: "#15803d",
              fontSize: "15px",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            Message sent. We&apos;ll be in touch soon.
          </div>
        )}

        <div className="contact-grid">
          <section className="contact-panel">
            <h2 className="contact-panel-title">Send a message</h2>
            <p className="contact-panel-copy">
              Fill out the form below and we&apos;ll get back to you as soon as we can.
            </p>

            <form
              action="/contact"
              method="post"
              className="contact-form"
            >
              <div className="contact-field">
                <label htmlFor="name" className="contact-label">Name</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="Your name"
                  required
                  autoComplete="name"
                  className="contact-input"
                />
              </div>

              <div className="contact-field">
                <label htmlFor="email" className="contact-label">Email</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="contact-input"
                />
              </div>

              <div className="contact-field">
                <label htmlFor="message" className="contact-label">Message</label>
                <textarea
                  id="message"
                  name="message"
                  placeholder="How can we help?"
                  required
                  rows={6}
                  className="contact-input contact-textarea"
                />
              </div>

              <button className="contact-button" type="submit">
                Send message
              </button>
            </form>
          </section>

          <section className="contact-panel contact-panel--info">
            <h2 className="contact-panel-title">Other ways to reach us</h2>
            <div className="contact-info-list">
              <div className="contact-info-item">
                <h3 className="contact-info-label">Documentation</h3>
                <p className="contact-info-body">
                  <a href="/docs/" className="contact-info-link">
                    Browse the docs →
                  </a>
                </p>
              </div>
              <div className="contact-info-item">
                <h3 className="contact-info-label">Dashboard</h3>
                <p className="contact-info-body">
                  <a href="/dashboard" className="contact-info-link">
                    Go to dashboard →
                  </a>
                </p>
              </div>
              <div className="contact-info-item">
                <h3 className="contact-info-label">Setup</h3>
                <p className="contact-info-body">
                  <a href="/setup" className="contact-info-link">
                    Create an account →
                  </a>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
