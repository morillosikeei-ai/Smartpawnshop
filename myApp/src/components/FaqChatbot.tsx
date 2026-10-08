import React, { useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { arrowForwardOutline, chatbubbleEllipsesOutline, closeOutline, sendOutline } from 'ionicons/icons';
import { actionFor, answerFor, FaqEntry } from './faqData';
import { askChatAssistant, ChatTurn } from '../services/api';
import './FaqChatbot.css';

/** Shortest time the typing indicator shows, in ms, so a fast answer does not flash. */
const TYPING_DELAY_MS = 500;

/** Where the signed in customer's name is kept after login. */
const CUSTOMER_KEY = 'smartpawn_customer';

type ChatMessage = {
  id: number;
  from: 'bot' | 'customer';
  text: string;
  /** When the message was sent or received, for the timestamp under the bubble. */
  at: number;
  /** A place in the app the answer points at, shown as a button under the text. */
  action?: FaqEntry['action'];
};

type FaqChatbotProps = {
  /** The signed in customer's name, used in the greeting. */
  customerName?: string | null;
  /**
   * Opens the My Items tab. Left out on the public landing page, where there is
   * no such tab, and the quick action button then stays hidden.
   */
  onGoToItems?: () => void;
  /**
   * Opens the chat from outside the bubble. Each new number opens it once, so
   * a button elsewhere on the page can bump it to bring the chat up.
   */
  openSignal?: number;
};

const GENERIC_GREETING =
  'Kumusta! Ako si Pag-Asa Assistant. Pangutana lang about redemption, interest (renta), requirements, or your item status. Ask me anything about pawning.';

const greetingFor = (name: string) =>
  name
    ? `Kumusta, ${name}! Ako si Pag-Asa Assistant. Pangutana lang about redemption, interest (renta), requirements, or your item status. Ask me anything about pawning.`
    : GENERIC_GREETING;

const QUICK_QUESTIONS = ['How to redeem?', 'Interest (Renta)?', 'Unsay requirements?', 'Contact info'];

/**
 * The name kept in the browser after login, used when the widget is rendered
 * without a name from its parent. Returns an empty string when nobody is
 * signed in, which leaves the greeting generic.
 */
const storedCustomerName = (): string => {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null');
    return stored && typeof stored.name === 'string' ? stored.name.trim() : '';
  } catch {
    // A private window, cleared site data, or storage the browser blocks.
    // Losing the name only means the greeting stays generic.
    return '';
  }
};

/** The local clock time of a message, as the browser formats it, e.g. "1:49 PM". */
const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Floating FAQ chat bubble.
 *
 * Answers come from Google Gemini through the API's /chat endpoint. When that fails
 * or returns no answer (no API key, offline, rate limited), the reply falls
 * back to the local keyword table, so the chat always answers something.
 */
const FaqChatbot: React.FC<FaqChatbotProps> = ({ customerName, onGoToItems, openSignal }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 0, from: 'bot', text: greetingFor(customerName?.trim() || storedCustomerName()), at: Date.now() },
  ]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  // Cleared on unmount so a reply that lands late is dropped, not set on a gone widget.
  const mounted = useRef(true);

  // The name arrives with the account data, which lands after the first render,
  // so the greeting is rewritten once it is known. Only the untouched greeting
  // is replaced, so a conversation already under way is left alone.
  useEffect(() => {
    const name = customerName?.trim();
    if (!name) return;

    setMessages((current) =>
      current.length === 1 && current[0].id === 0
        ? [{ ...current[0], text: greetingFor(name) }]
        : current
    );
  }, [customerName]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;

    const customerMessage: ChatMessage = { id: nextId.current++, from: 'customer', text, at: Date.now() };
    // The greeting is left out: it is canned, and the model gets its own instructions.
    const history: ChatTurn[] = [...messages, customerMessage]
      .filter((message) => message.id !== 0)
      .map((message) => ({ role: message.from === 'customer' ? 'user' : 'assistant', content: message.text }));

    setMessages((current) => [...current, customerMessage]);
    setDraft('');
    setTyping(true);

    const [reply] = await Promise.all([
      askChatAssistant(history).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, TYPING_DELAY_MS)),
    ]);
    if (!mounted.current) return;

    setMessages((current) => [
      ...current,
      { id: nextId.current++, from: 'bot', text: reply || answerFor(text), at: Date.now(), action: actionFor(text) || undefined },
    ]);
    setTyping(false);
  };

  return (
    <div className="faq-chatbot">
      {open && (
        <section className="faq-panel" role="dialog" aria-label="Frequently asked questions chat">
          <header className="faq-panel-head">
            <div className="faq-head-brand">
              <span className="faq-avatar" aria-hidden="true"><IonIcon icon={chatbubbleEllipsesOutline} /></span>
              <div>
                <strong>Pag-Asa Assistant</strong>
                <small>Kanunay online · Always available</small>
              </div>
            </div>
            <button className="faq-panel-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <IonIcon icon={closeOutline} />
            </button>
          </header>

          <div className="faq-messages" ref={listRef}>
            {messages.map((message) => (
              <div key={message.id} className={`faq-message ${message.from}`}>
                <div className="faq-bubble-wrap">
                  <p>{message.text}</p>
                  {message.action === 'items' && onGoToItems && (
                    <button
                      type="button"
                      className="faq-action"
                      onClick={() => {
                        setOpen(false);
                        onGoToItems();
                      }}
                    >
                      Go to My Items
                      <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
                    </button>
                  )}
                  <time className="faq-time" dateTime={new Date(message.at).toISOString()}>
                    {clockTime(message.at)}
                  </time>
                </div>
              </div>
            ))}
            {typing && (
              <div className="faq-message bot faq-typing" aria-live="polite">
                <div className="faq-bubble-wrap">
                  <p><i /><i /><i /></p>
                </div>
              </div>
            )}
          </div>

          <div className="faq-quick">
            {QUICK_QUESTIONS.map((question) => (
              <button key={question} onClick={() => send(question)} disabled={typing}>{question}</button>
            ))}
          </div>

          <form
            className="faq-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your question..."
              aria-label="Type your question"
            />
            <button type="submit" aria-label="Send message" disabled={!draft.trim() || typing}>
              <IonIcon icon={sendOutline} />
            </button>
          </form>
        </section>
      )}

      <button
        className={`faq-bubble ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close help chat' : 'Open help chat'}
        aria-expanded={open}
      >
        <IonIcon icon={open ? closeOutline : chatbubbleEllipsesOutline} />
      </button>
    </div>
  );
};

export default FaqChatbot;
