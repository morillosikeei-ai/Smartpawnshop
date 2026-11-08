<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Add New Customer address: Province, City/Municipality and Barangay from
 * the PSGC list (Metro Manila listed as a province), then the street. The parts
 * and the complete address are saved separately.
 */
class CustomerAddressTest extends TestCase
{
    use RefreshDatabase;

    private const MISAMIS_ORIENTAL = '104300000';
    private const CAGAYAN_DE_ORO = '104305000';

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        Sanctum::actingAs(User::create(['name' => 'Counter Staff', 'email' => 'staff@example.test', 'password' => 'secret-password', 'role' => 'staff', 'status' => 'active']));
    }

    private function register(array $address)
    {
        return $this->postJson('/api/customers', [
            'name' => 'Maria Santos',
            'email' => 'maria.santos.address@gmail.com',
            'contact_number' => '09170000000',
            'valid_id_type' => 'National ID',
            'valid_id_number' => 'ID-123',
            ...$address,
        ]);
    }

    public function test_the_lists_cascade_and_metro_manila_is_a_province(): void
    {
        $provinces = $this->getJson('/api/psgc/provinces')->assertOk()->json();
        $this->assertContains(['code' => 'NCR', 'name' => 'Metro Manila'], $provinces);
        $this->assertContains(['code' => self::MISAMIS_ORIENTAL, 'name' => 'Misamis Oriental'], $provinces);

        $ncr = collect($this->getJson('/api/psgc/provinces/NCR/cities')->assertOk()->json())->pluck('name');
        $this->assertTrue($ncr->contains('City of Manila'));
        $this->assertTrue($ncr->contains('Quezon City'));

        $cities = collect($this->getJson('/api/psgc/provinces/'.self::MISAMIS_ORIENTAL.'/cities')->json());
        $this->assertSame(self::CAGAYAN_DE_ORO, $cities->firstWhere('name', 'City of Cagayan De Oro')['code']);

        $this->assertContains('Kauswagan', $this->getJson('/api/psgc/cities/'.self::CAGAYAN_DE_ORO.'/barangays')->assertOk()->json());

        $this->getJson('/api/psgc/provinces/999999999/cities')->assertNotFound();
        $this->getJson('/api/psgc/cities/999999999/barangays')->assertNotFound();
    }

    public function test_the_parts_and_complete_address_are_saved_separately(): void
    {
        $this->register([
            'province_code' => self::MISAMIS_ORIENTAL,
            'city_code' => self::CAGAYAN_DE_ORO,
            'barangay' => 'Kauswagan',
            'street' => ' 123 Rizal St. ',
            // A complete address sent by the app is rebuilt from the parts.
            'address' => 'anything',
        ])->assertCreated();

        $customer = Customer::firstOrFail();
        $this->assertSame('Misamis Oriental', $customer->province);
        $this->assertSame('City of Cagayan De Oro', $customer->city_municipality);
        $this->assertSame('Kauswagan', $customer->barangay);
        $this->assertSame('123 Rizal St.', $customer->street);
        $this->assertSame('123 Rizal St., Brgy. Kauswagan, City of Cagayan De Oro, Misamis Oriental', $customer->address);
    }

    public function test_a_metro_manila_address_has_metro_manila_as_its_province(): void
    {
        $manila = collect($this->getJson('/api/psgc/provinces/NCR/cities')->json())->firstWhere('name', 'City of Manila')['code'];
        $barangay = $this->getJson("/api/psgc/cities/{$manila}/barangays")->json()[0];

        $this->register(['province_code' => 'NCR', 'city_code' => $manila, 'barangay' => $barangay])->assertCreated();

        $customer = Customer::firstOrFail();
        $this->assertSame('Metro Manila', $customer->province);
        $this->assertNull($customer->street);
        $this->assertStringEndsWith(', City of Manila, Metro Manila', $customer->address);
        $this->assertStringStartsWith('Brgy. ', $customer->address);
    }

    public function test_parts_that_do_not_belong_together_are_refused(): void
    {
        // Kauswagan is not a barangay of Quezon City, and Cagayan de Oro is not in Metro Manila.
        $this->register(['province_code' => 'NCR', 'city_code' => self::CAGAYAN_DE_ORO, 'barangay' => 'Kauswagan'])
            ->assertStatus(422)->assertJsonValidationErrors('city_code');
        $this->register(['province_code' => self::MISAMIS_ORIENTAL, 'city_code' => self::CAGAYAN_DE_ORO, 'barangay' => 'Not A Barangay'])
            ->assertStatus(422)->assertJsonValidationErrors('barangay');
        $this->register(['province_code' => self::MISAMIS_ORIENTAL])
            ->assertStatus(422)->assertJsonValidationErrors(['city_code', 'barangay']);

        $this->assertSame(0, Customer::count());
    }

    public function test_a_plain_address_without_parts_still_saves(): void
    {
        $this->register(['address' => 'Old style address'])->assertCreated();

        $this->assertSame('Old style address', Customer::firstOrFail()->address);
        $this->assertNull(Customer::firstOrFail()->province);
    }
}
