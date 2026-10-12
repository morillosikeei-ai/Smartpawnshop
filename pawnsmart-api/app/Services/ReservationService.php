<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemReservation;
use App\Models\ShopClosure;
use App\Models\SystemSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Customers holding items for sale until they come in to buy them.
 *
 * A hold lasts two open days: it ends at closing time on the second day the
 * shop opens, counting today while the shop has not yet closed. Days the shop
 * is shut (the weekly pattern in settings and announced closures) are skipped,
 * so a hold never runs out while the customer could not have come in.
 */
class ReservationService
{
    /** The shop's clock. The app stores and compares times in UTC. */
    public const SHOP_TIMEZONE = 'Asia/Manila';

    /** How many open days a hold lasts. */
    public const HOLD_OPEN_DAYS = 2;

    public function __construct(private NotificationService $notifications) {}

    /** When a hold placed at $from runs out, in UTC. */
    public function holdUntil(?Carbon $from = null): Carbon
    {
        $now = ($from ?? now())->copy()->setTimezone(self::SHOP_TIMEZONE);
        $openDays = $this->openDays();
        $closes = $this->setting('shop_closes_at', '18:00');
        $closures = ShopClosure::whereBetween('closure_date', [$now->toDateString(), $now->copy()->addDays(60)->toDateString()])
            ->get()
            ->keyBy(fn (ShopClosure $closure) => $closure->closure_date->toDateString());

        $counted = 0;
        $day = $now->copy()->startOfDay();
        // Two months is far more than any run of closed days; the cap only
        // guards against settings that leave the shop shut every day.
        for ($i = 0; $i < 60; $i++, $day->addDay()) {
            $closure = $closures->get($day->toDateString());
            if (! in_array($day->isoWeekday(), $openDays, true) || $closure?->kind === 'closed') {
                continue;
            }

            [$hour, $minute] = array_map('intval', explode(':', $closure?->closes_at ?: $closes));
            $closingTime = $day->copy()->setTime($hour, $minute);
            if ($closingTime->lessThanOrEqualTo($now)) {
                continue;
            }

            if (++$counted === self::HOLD_OPEN_DAYS) {
                return $closingTime->setTimezone('UTC');
            }
        }

        // No open day ahead at all: fall back to two calendar days.
        return $now->copy()->addDays(self::HOLD_OPEN_DAYS)->setTimezone('UTC');
    }

    public function reserve(Item $item, Customer $customer, int $userId): ItemReservation
    {
        $reservation = DB::transaction(function () use ($item, $customer) {
            // Lock the item row so two customers pressing Reserve at once
            // cannot both get it.
            $item = Item::whereKey($item->items_id)->lockForUpdate()->firstOrFail();

            if ($item->status !== 'for_sale') {
                throw ValidationException::withMessages(['item' => 'This item is no longer for sale.']);
            }
            if (ItemReservation::holding()->where('item_id', $item->items_id)->exists()) {
                throw ValidationException::withMessages(['item' => 'Someone has already reserved this item.']);
            }
            if (ItemReservation::holding()->where('customer_id', $customer->customers_id)->count() >= ItemReservation::MAX_ACTIVE_PER_CUSTOMER) {
                throw ValidationException::withMessages(['item' => 'You can reserve up to '.ItemReservation::MAX_ACTIVE_PER_CUSTOMER.' items at a time. Cancel one to reserve another.']);
            }

            return ItemReservation::create([
                'item_id' => $item->items_id,
                'customer_id' => $customer->customers_id,
                'expires_at' => $this->holdUntil(),
                'status' => ItemReservation::STATUS_ACTIVE,
            ]);
        });

        AuditLog::create(['user_id' => $userId, 'action' => 'Reserved item for sale #'.$item->items_id]);
        $this->notifications->itemReserved($reservation->load(['item', 'customer']));

        return $reservation;
    }

    /** Cancel a hold. $byStaff tells the customer, since they did not do it themselves. */
    public function cancel(ItemReservation $reservation, int $userId, bool $byStaff): ItemReservation
    {
        if ($reservation->status !== ItemReservation::STATUS_ACTIVE) {
            throw ValidationException::withMessages(['reservation' => 'This reservation is no longer active.']);
        }

        $reservation->update(['status' => ItemReservation::STATUS_CANCELLED, 'cancelled_by' => $userId]);
        AuditLog::create(['user_id' => $userId, 'action' => 'Cancelled reservation of item for sale #'.$reservation->item_id]);

        if ($byStaff) {
            $this->notifications->reservationCancelledByStaff($reservation->load(['item', 'customer']));
        }

        return $reservation;
    }

    /** The item was sold: the hold on it, if any, is fulfilled. */
    public function claim(Item $item): void
    {
        ItemReservation::holding()->where('item_id', $item->items_id)->update(['status' => ItemReservation::STATUS_CLAIMED]);
    }

    /** Mark every hold past its time expired and tell its customer. Returns how many. */
    public function expireDue(): int
    {
        $due = ItemReservation::with(['item', 'customer'])
            ->where('status', ItemReservation::STATUS_ACTIVE)
            ->where('expires_at', '<=', now())
            ->get();

        foreach ($due as $reservation) {
            $reservation->update(['status' => ItemReservation::STATUS_EXPIRED]);
            $this->notifications->reservationExpired($reservation);
        }

        return $due->count();
    }

    /** The ISO weekday numbers the shop opens on. Same source as the shop calendar. */
    private function openDays(): array
    {
        return collect(explode(',', $this->setting('shop_open_days', '1,2,3,4,5,6')))
            ->map(fn ($day) => (int) trim($day))
            ->filter(fn (int $day) => $day >= 1 && $day <= 7)
            ->values()
            ->all();
    }

    private function setting(string $key, string $default): string
    {
        return (string) (SystemSetting::where('setting_key', $key)->value('setting_value') ?: $default);
    }
}
