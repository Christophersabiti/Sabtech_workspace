import { createAdminSupabase } from '@/lib/platformAdmin';

export type PesapalConfig = {
  consumerKey: string;
  consumerSecret: string;
  ipnId: string;
  sandboxMode: boolean;
};

export async function getPesapalConfig(): Promise<PesapalConfig> {
  // Try loading from database first
  const adminSupabase = createAdminSupabase();
  const { data } = await adminSupabase
    .from('pesapal_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const config = {
    consumerKey: data?.consumer_key || process.env.PESAPAL_CONSUMER_KEY || '',
    consumerSecret: data?.consumer_secret || process.env.PESAPAL_CONSUMER_SECRET || '',
    ipnId: data?.ipn_id || process.env.PESAPAL_IPN_ID || '',
    sandboxMode: data !== null ? !!data.sandbox_mode : process.env.NEXT_PUBLIC_PESAPAL_SANDBOX_MODE !== 'false',
  };

  return config;
}

function getBaseUrl(sandboxMode: boolean): string {
  return sandboxMode ? 'https://cyb.pesapal.com/pesapalv3' : 'https://pay.pesapal.com/pesapalv3';
}

export async function getPesapalToken(config: PesapalConfig): Promise<string> {
  if (!config.consumerKey || !config.consumerSecret) {
    throw new Error('Pesapal Consumer Key or Consumer Secret is missing.');
  }

  const baseUrl = getBaseUrl(config.sandboxMode);
  const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      consumer_key: config.consumerKey,
      consumer_secret: config.consumerSecret,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pesapal Authentication Failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json() as { token: string };
  return data.token;
}

export async function registerPesapalIpn(
  token: string,
  sandboxMode: boolean,
  webhookUrl: string
): Promise<string> {
  const baseUrl = getBaseUrl(sandboxMode);
  const response = await fetch(`${baseUrl}/api/URLRegister/RegisterIPN`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: webhookUrl,
      ipn_notification_type: 'GET',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pesapal IPN Registration Failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json() as { ipn_id: string; status: string; error?: string };
  if (data.error) {
    throw new Error(`Pesapal IPN Error: ${data.error}`);
  }
  return data.ipn_id;
}

export type OrderRequestPayload = {
  merchantReference: string;
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
  ipnId: string;
  billingAddress: {
    email: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  };
};

export async function submitPesapalOrder(
  token: string,
  sandboxMode: boolean,
  payload: OrderRequestPayload
): Promise<{ orderTrackingId: string; redirectUrl: string }> {
  const baseUrl = getBaseUrl(sandboxMode);
  const response = await fetch(`${baseUrl}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: payload.merchantReference,
      currency: payload.currency,
      amount: payload.amount,
      description: payload.description,
      callback_url: payload.callbackUrl,
      notification_id: payload.ipnId,
      billing_address: {
        email_address: payload.billingAddress.email,
        phone_number: payload.billingAddress.phoneNumber || '',
        country_code: 'UG',
        first_name: payload.billingAddress.firstName || 'SaaS',
        last_name: payload.billingAddress.lastName || 'Subscriber',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pesapal Order Submission Failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json() as {
    order_tracking_id: string;
    merchant_reference: string;
    redirect_url: string;
    status: string;
    error?: unknown;
  };

  if (data.error) {
    throw new Error(`Pesapal Order Error: ${JSON.stringify(data.error)}`);
  }

  return {
    orderTrackingId: data.order_tracking_id,
    redirectUrl: data.redirect_url,
  };
}

export type PesapalTransactionStatus = {
  paymentMethod: string;
  amount: number;
  createdDate: string;
  confirmationCode: string;
  paymentStatusDescription: string;
  statusCode: number; // 1 = Success, 2 = Failed, 0 = Pending
  merchantReference: string;
  currency: string;
  error?: string;
};

export async function getPesapalTransactionStatus(
  token: string,
  sandboxMode: boolean,
  orderTrackingId: string
): Promise<PesapalTransactionStatus> {
  const baseUrl = getBaseUrl(sandboxMode);
  const response = await fetch(
    `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Pesapal Transaction Status Failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json() as {
    payment_method: string;
    amount: number;
    created_date: string;
    confirmation_code: string;
    payment_status_description: string;
    status_code: number;
    merchant_reference: string;
    currency: string;
    error: string | null;
    status: string;
  };

  return {
    paymentMethod: data.payment_method,
    amount: data.amount,
    createdDate: data.created_date,
    confirmationCode: data.confirmation_code,
    paymentStatusDescription: data.payment_status_description,
    statusCode: data.status_code,
    merchantReference: data.merchant_reference,
    currency: data.currency,
    error: data.error || undefined,
  };
}
