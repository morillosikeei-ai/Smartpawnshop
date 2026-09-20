const fs = require('fs');
const p = 'app/Http/Controllers/ApiController.php';
let s = fs.readFileSync(p, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const add = (after, line) => {
  if (s.includes(line)) return;
  if (!s.includes(after)) throw new Error('missing anchor: ' + after);
  s = s.replace(after, after + eol + line);
};
add('use App\Models\Customer;', 'use App\Models\CustomerAccessToken;');
add('use App\Mail\PasswordResetMail;', 'use App\Support\FrontendUrl;');
add('use Illuminate\Support\Facades\Hash;', 'use Illuminate\Support\Facades\Crypt;');
fs.writeFileSync(p, s);
console.log('eol=' + JSON.stringify(eol));
