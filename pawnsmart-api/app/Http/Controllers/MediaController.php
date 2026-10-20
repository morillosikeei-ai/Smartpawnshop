<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Item;
use App\Models\RenewalRequest;
use App\Support\MediaUrl;

/**
 * Serves stored photos by signed link (see App\Support\MediaUrl). The
 * signature is the access check: only the API hands these links out, and only
 * inside responses the viewer was already allowed to see.
 */
class MediaController extends Controller
{
    public function itemPhoto(Item $item, int $index)
    {
        return MediaUrl::respond($item->storedPhotos()[$index] ?? null);
    }

    public function customerIdPhoto(Customer $customer)
    {
        return MediaUrl::respond($customer->getRawOriginal('valid_id_photo'));
    }

    public function renewalReceipt(RenewalRequest $renewalRequest)
    {
        return MediaUrl::respond($renewalRequest->getRawOriginal('receipt_path'));
    }
}
