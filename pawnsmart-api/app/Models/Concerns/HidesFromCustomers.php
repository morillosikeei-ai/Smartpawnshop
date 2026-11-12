<?php

namespace App\Models\Concerns;

/**
 * Leaves the model's $customerHidden fields out of the JSON when the signed-in
 * user is a customer. Staff and admin still get every field.
 *
 * The appraised value is for the shop only, so the item's value fields, and
 * anything a customer could work it back from, are listed there.
 */
trait HidesFromCustomers
{
    public function toArray()
    {
        $data = parent::toArray();

        if (request()->user()?->role === 'customer') {
            foreach ($this->customerHidden as $field) {
                unset($data[$field]);
            }
        }

        return $data;
    }
}
