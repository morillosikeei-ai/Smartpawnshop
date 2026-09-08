<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::getConnection()->table('items')->whereIn('category', ['watch', 'other'])->update(['category' => 'ring']);
        Schema::getConnection()->statement("ALTER TABLE items MODIFY category ENUM('ring','necklace','bracelet','earrings','pendant') NOT NULL");
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::getConnection()->statement("ALTER TABLE items MODIFY category ENUM('ring','necklace','bracelet','earrings','pendant','watch','other') NOT NULL");
    }
};
