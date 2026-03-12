const CHAT_COOKIE_NAME = "texty_chat";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const parseCookies = (request: Request) => {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    cookieHeader.split(";").flatMap((cookie) => {
      const [name, ...valueParts] = cookie.trim().split("=");

      if (!name || valueParts.length === 0) {
        return [];
      }

      return [[name, valueParts.join("=")]];
    }),
  );
};

export const getChatSessionId = (request: Request) =>
  parseCookies(request).get(CHAT_COOKIE_NAME) || null;

export const createChatSessionId = () => crypto.randomUUID();

export const createChatCookie = (sessionId: string) => {
  const secure = import.meta.env.DEV ? "" : " Secure;";

  return `${CHAT_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE};${secure}`;
};
