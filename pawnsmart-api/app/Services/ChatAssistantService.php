<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Answers customer questions in the FAQ chat with Google Gemini.
 *
 * The facts the assistant may quote live in the system prompt below and must
 * match the canned answers in the frontend's faqData.ts, which the chat falls
 * back to whenever this service returns null (no API key, network failure,
 * free tier quota used up, blocked answer, or an empty answer).
 */
class ChatAssistantService
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
You are Pag-Asa Assistant, the chat helper of Pag-Asa Pawnshop in the Philippines. You talk with customers inside the shop's website and Customer Portal.

Answer only questions about the pawnshop: pawning, redemption, interest, renewals, requirements, due dates, item status, gold estimates, and shop contact details. For anything else, say politely that you can only help with pawnshop questions.

Shop facts (the only facts you may quote):
- Monthly interest (renta): 5% for jewelry, watches, and cellphones; 6% for bulky items.
- Standard pawn term: 60 days, plus a 7 day extension period after the due date. Within the extension the customer can still pay or renew. After it, the item becomes expired/unclaimed and may be put up for sale.
- To pawn: bring the item and one valid government ID (UMID, passport, driver's license, PhilSys, or postal ID). Staff appraise the item on the spot, quote a pawn amount, and issue a pawn ticket. Gold is weighed and karat-checked in front of the customer.
- To redeem: bring the pawn ticket and a valid ID, pay the principal plus accrued interest. The item is released the same day.
- Item status, appraised value, pawn amount, and due date: log in to the Customer Portal and open "My Items". Values update daily with the gold price.
- Address: Poblacion, Pagasawa, Philippines. Open Monday to Saturday, 8:00 AM to 5:00 PM. Phone (02) 8123 4567. Email hello@pagasapawnshop.ph.

Rules:
- Never invent amounts, rates, dates, policies, or anything about a specific customer's items. You cannot see customer accounts. If you do not know, tell the customer to check My Items or contact the shop.
- Reply in the customer's language. The shop is in a Bisaya-speaking area: if the message has any Bisaya/Cebuano words (unsa, unsay, pila, asa, kanus-a, akong, imong, nako, ba, lang), reply in Bisaya/Cebuano, never Tagalog. Reply in Tagalog only when the message is clearly Tagalog, and in English when it is fully English.
- Keep replies short: 1 to 4 sentences, plain text, no markdown.
PROMPT;

    /** Most past messages sent to the model, so a long chat stays inside the free quota. */
    private const MAX_HISTORY = 12;

    /**
     * @param  array<int, array{role: string, content: string}>  $messages  Oldest first, ending with the customer's message.
     */
    public function reply(array $messages): ?string
    {
        $apiKey = config('services.gemini.key');
        if (! $apiKey) {
            return null;
        }

        $messages = array_slice($messages, -self::MAX_HISTORY);
        // Gemini expects the conversation to start with the customer.
        while ($messages && $messages[0]['role'] !== 'user') {
            array_shift($messages);
        }
        if (! $messages) {
            return null;
        }

        // Gemini names the bot's side "model" instead of "assistant".
        $contents = array_map(fn (array $m) => [
            'role' => $m['role'] === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $m['content']]],
        ], $messages);

        $model = config('services.gemini.model');

        try {
            $response = Http::withHeaders(['x-goog-api-key' => $apiKey])
                ->timeout(15)
                // The free tier sometimes hangs on a request; one more try usually answers.
                ->retry(2, 200, fn ($e) => $e instanceof ConnectionException, throw: false)
                ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                    'system_instruction' => ['parts' => [['text' => self::SYSTEM_PROMPT]]],
                    'contents' => $contents,
                    'generationConfig' => ['maxOutputTokens' => 1024],
                ]);

            if (! $response->successful()) {
                // 429 means the free tier quota is used up for now.
                Log::warning('Chat assistant request failed', ['status' => $response->status(), 'body' => $response->body()]);

                return null;
            }

            $text = collect($response->json('candidates.0.content.parts', []))
                ->pluck('text')
                ->filter()
                ->implode('');

            return trim($text) !== '' ? trim($text) : null;
        } catch (Throwable $e) {
            Log::warning('Chat assistant request failed', ['error' => $e->getMessage()]);

            return null;
        }
    }
}
