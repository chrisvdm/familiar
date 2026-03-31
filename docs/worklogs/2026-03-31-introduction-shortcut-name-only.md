# 2026-03-31 Introduction Shortcut Name Only

## Context

The direct-reply path had a hardcoded introduction shortcut that treated `my name is ...`, `i am ...`, and `i'm ...` as the same kind of self-introduction. That caused identity or role statements such as `i am a web developer` to trigger a canned greeting like `Hi A Web Developer, pleased to meet you.`

## Change

- moved introduced-name extraction into `src/app/provider/provider.logic.ts`
- narrowed the matcher to explicit `my name is ...` introductions only
- added regression coverage for role and state statements that should not trigger the shortcut

## Result

- `my name is chris` still gets the lightweight greeting path
- `i am a web developer`, `i'm tired`, and similar statements now fall back to normal conversational handling
