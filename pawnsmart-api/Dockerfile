FROM php:8.3-cli
RUN apt-get update && apt-get install -y git unzip libzip-dev libpq-dev && docker-php-ext-install pdo_pgsql pdo_mysql zip
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
COPY . .
RUN composer install --no-dev --optimize-autoloader
CMD php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
