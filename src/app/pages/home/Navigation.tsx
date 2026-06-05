"use client";

import { useState } from "react";
import { FamiliarName } from "@/app/components/familiar-name";

const Navigation = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="public-nav width--100 flex--row flex--space-between"
      aria-label="Primary"
      style={{ position: "relative" }}
    >
      <a className="landing-nav-brand" href="/" aria-label="familiar home">
        <FamiliarName className="landing-nav-logo" />
        <h1 hidden>familiar</h1>
      </a>
      <button
        className="nav-hamburger mobile--only"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
        type="button"
      >
        {open ? "✕" : "☰"}
      </button>
      <div
        className={`flex--row flex--gap-s nav-links ${
          open ? "nav-links--open" : ""
        }`}
      >
        <a
          className="landing-nav-link"
          href="/contact"
          onClick={() => setOpen(false)}
        >
          Contact
        </a>
        <a
          className="landing-nav-link"
          href="/docs/"
          onClick={() => setOpen(false)}
        >
          Docs
        </a>
        <a
          className="landing-nav-link"
          href="/setup"
          onClick={() => setOpen(false)}
        >
          Setup
        </a>
      </div>
    </nav>
  );
};

export default Navigation;
