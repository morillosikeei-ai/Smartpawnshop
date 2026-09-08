import React, { useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chatbubbleEllipsesOutline, closeOutline, sendOutline } from 'ionicons/icons';
import { answerFor } from './faqData';
import './FaqChatbot.css';

/** How long the typing indicator shows before the answer appears, in ms. */
const TYPING_DELAY_MS = 500;

type ChatMessage = {
  id: number;
  from: 'bot' | 'customer';
  text: string;
};

const GREETING: ChatMessage = {
  id: 0,
  from: 'bot',
  text: 'Kumusta! Ako si Pag-Asa Assistant. Pangutana lang about redemption, interest rates, requirements, or your item status. Ask me anything about pawning.',
};

const QUICK_QUESTIONS = ['How to redeem?', 'Interest rate?', 'Unsay requirements?', 'Contact info'];

/**
 * Floating FAQ chat bubble.
 *
 * Rule based and fully offline: answers come from a local keyword table, so
 * the widget works the same signed in or signed out and never calls the API.
 */
const FaqChatbot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  // Held so the delayed reply can be cancelled if the widget unmounts first.
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open]);

  useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;

    setMessages((current) => [...current, { id: nextId.current++, from: 'customer', text }]);
    setDraft('');
    setTyping(true);

    // Purely cosmetic pause. No request is made; the answer is already known.
    replyTimer.current = setTimeout(() => {
      setMessages((current) => [...current, { id: nextId.current++, from: 'bot', text: answerFor(text) }]);
      setTyping(false);
    }, TYPING_DELAY_MS);
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
                <p>{message.text}</p>
              </div>
            ))}
            {typing && (
              <div className="faq-message bot faq-typing" aria-live="polite">
                <p><i /><i /><i /></p>
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
