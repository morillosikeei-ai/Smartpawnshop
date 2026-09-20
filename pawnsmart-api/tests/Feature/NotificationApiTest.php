<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The notification endpoints are scoped to the caller.
 *
 * A recipient reads and marks read only their own rows: a leak here would show
 * one customer another customer's items and loans.
 */
class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $email): User
    {
        return User::create([
            'name' => 'Customer '.$email,
            'email' => $email,
            'password' => 'secret-password',
            'role' => 'customer',
            'status' => 'active',
        ]);
    }

    public function test_a_user_sees_only_their_own_notifications_newest_first(): void
    {
        $mine = $this->customer('mine@example.test');
        $theirs = $this->customer('theirs@example.test');

        $older = Notification::create(['user_id' => $mine->users_id, 'type' => 'due_soon', 'message' => 'Older of mine']);
        $newer = Notification::create(['user_id' => $mine->users_id, 'type' => 'item_created', 'message' => 'Newer of mine']);
        Notification::create(['user_id' => $theirs->users_id, 'type' => 'due_soon', 'message' => 'Not mine']);

        Sanctum::actingAs($mine);

        $response = $this->getJson('/api/notifications')->assertOk();

        $messages = array_column($response->json('notifications'), 'message');

        $this->assertSame(['Newer of mine', 'Older of mine'], $messages);
        $this->assertSame(2, $response->json('unread_count'));
        $this->assertSame([$newer->notifications_id, $older->notifications_id], array_column($response->json('notifications'), 'notifications_id'));
    }

    public function test_the_unread_count_ignores_rows_already_read(): void
    {
        $user = $this->customer('counted@example.test');
        Notification::create(['user_id' => $user->users_id, 'type' => 'due_soon', 'message' => 'Unread']);
        Notification::create(['user_id' => $user->users_id, 'type' => 'due_soon', 'message' => 'Read', 'is_read' => true]);

        Sanctum::actingAs($user);

        $this->getJson('/api/notifications')->assertOk()->assertJsonPath('unread_count', 1);
    }

    public function test_a_user_can_mark_their_own_notification_read(): void
    {
        $user = $this->customer('reader@example.test');
        $notification = Notification::create(['user_id' => $user->users_id, 'type' => 'due_soon', 'message' => 'Mine to read']);

        Sanctum::actingAs($user);

        $this->postJson('/api/notifications/'.$notification->notifications_id.'/read')
            ->assertOk()
            ->assertJsonPath('notification.is_read', true)
            ->assertJsonPath('unread_count', 0);

        $this->assertTrue($notification->fresh()->is_read);
    }

    public function test_a_user_cannot_mark_another_users_notification_read(): void
    {
        $mine = $this->customer('caller@example.test');
        $theirs = $this->customer('owner@example.test');
        $notification = Notification::create(['user_id' => $theirs->users_id, 'type' => 'due_soon', 'message' => 'Not mine']);

        Sanctum::actingAs($mine);

        $this->postJson('/api/notifications/'.$notification->notifications_id.'/read')->assertNotFound();

        $this->assertFalse($notification->fresh()->is_read);
    }

    public function test_notifications_require_authentication(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
    }
}
