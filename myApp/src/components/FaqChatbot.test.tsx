import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FaqChatbot from './FaqChatbot';
import { matchFor, nextQuickQuestions, QUICK_QUESTIONS } from './faqData';

vi.mock('../services/api', () => ({ askChatAssistant: vi.fn(async () => null) }));

// jsdom has no scrolling; the chat scrolls to its newest message.
Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];

const shownQuestions = () =>
  Array.from(document.querySelectorAll('.faq-quick button')).map(button => button.textContent);

describe('quick questions', () => {
  it('each one answers a different FAQ topic', () => {
    const topics = QUICK_QUESTIONS.map(question => matchFor(question)?.id);
    expect(topics.every(Boolean)).toBe(true);
    expect(new Set(topics).size).toBe(QUICK_QUESTIONS.length);
  });

  it('shows four, skipping the ones already asked, and starts over once all are asked', () => {
    expect(nextQuickQuestions([])).toEqual(QUICK_QUESTIONS.slice(0, 4));
    expect(nextQuickQuestions(['How to redeem?'])).toEqual(QUICK_QUESTIONS.slice(1, 5));
    expect(nextQuickQuestions(QUICK_QUESTIONS.slice(0, 5))).toEqual(QUICK_QUESTIONS.slice(5));
    expect(nextQuickQuestions([...QUICK_QUESTIONS])).toEqual(QUICK_QUESTIONS.slice(0, 4));
  });

  it('a tapped question is answered and makes way for a new one', () => {
    render(<FaqChatbot />);
    fireEvent.click(document.querySelector('.faq-bubble') as HTMLElement);

    expect(shownQuestions()).toEqual(QUICK_QUESTIONS.slice(0, 4));
    fireEvent.click(screen.getByRole('button', { name: 'How to redeem?' }));

    expect(shownQuestions()).not.toContain('How to redeem?');
    expect(shownQuestions()).toContain('What if I miss the due date?');
    expect(shownQuestions()).toHaveLength(4);
  });
});
