import {
  DeliveryItemCondition,
  DeliveryNote,
  Material,
  MaterialRequest,
  MaterialRequestStatus,
  MaterialTransaction,
  PMSState,
  StockOpnameRecord,
  WarehouseLocation,
  WarehouseStockOrder,
} from '../types/pms';
import { ActorHeaders, buildActorHeaders, resolveApiUrl } from './attachmentApi';

function buildHeaders(actor: ActorHeaders): Record<string, string> {
  return {
    ...buildActorHeaders(actor),
    'Content-Type': 'application/json',
  };
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(resolveApiUrl(input), init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    throw new Error(
      `Gagal terhubung ke server backend (${detail}). Pastikan server aplikasi aktif dan koneksi stabil.`
    );
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Gagal memproses permintaan gudang (HTTP ${res.status})`);
  }
  return data;
}

export interface SaveWarehouseLocationPayload {
  code?: string;
  name: string;
  address: string;
  pic_name?: string;
  notes?: string;
  is_active?: boolean;
}

export interface CreateWarehouseMaterialPayload {
  code: string;
  name: string;
  category: string;
  unit: string;
  min_stock: number;
  default_warehouse_id?: string;
  warehouse_location: string;
  unit_cost: number;
  sku_notes?: string;
}

export interface UpdateWarehouseMaterialPayload {
  code?: string;
  name?: string;
  category?: string;
  unit?: string;
  min_stock?: number;
  default_warehouse_id?: string;
  warehouse_location?: string;
  unit_cost?: number;
  sku_notes?: string;
}

export interface CreateStockOrderPayload {
  material_id: string;
  warehouse_id: string;
  qty_planned: number;
  order_date: string;
  source_name: string;
  proof_ref: string;
  unit_cost?: number;
  project_id?: string;
  rab_item_id?: string;
  proof_attachment_ids?: string[];
  notes?: string;
}

export interface DecideStockOrderFinancePayload {
  decision: 'APPROVE' | 'REJECT';
  note?: string;
}

export interface ConfirmStockOrderReceiptPayload {
  warehouse_id?: string;
  qty_actual: number;
  received_date: string;
  source_name?: string;
  proof_ref: string;
  inspection_note?: string;
  proof_attachment_ids?: string[];
}

export interface IssueWarehouseStockPayload {
  material_id: string;
  warehouse_id?: string;
  project_id: string;
  rab_item_id?: string;
  request_id?: string;
  qty: number;
  date: string;
  source_or_destination: string;
  proof_ref: string;
  notes?: string;
}

export interface CreateWarehouseMaterialRequestPayload {
  project_id: string;
  rab_item_id?: string;
  needed_date: string;
  notes: string;
  items: Array<{ material_id: string; qty_requested: number }>;
}

export interface AdvanceWarehouseMaterialRequestPayload {
  next_status: MaterialRequestStatus;
  note?: string;
}

export interface CreateStockOpnamePayload {
  material_id: string;
  warehouse_id?: string;
  opname_date: string;
  physical_qty: number;
  condition_note: string;
  reason: string;
  proof_ref?: string;
  proof_attachment_ids?: string[];
}

export interface DeliveryNoteItemInput {
  material_id: string;
  qty_sent: number;
  rab_item_id?: string;
  notes?: string;
}

export interface SaveDeliveryNotePayload {
  delivery_date: string;
  project_id: string;
  source_warehouse_id: string;
  destination_location: string;
  sender_name?: string;
  sender_position?: string;
  recipient_id?: string;
  recipient_name: string;
  recipient_position: string;
  vehicle_info: string;
  driver_name: string;
  driver_phone?: string;
  request_id?: string;
  supplier_sj_no?: string;
  notes?: string;
  items: DeliveryNoteItemInput[];
}

export interface DispatchDeliveryNotePayload {
  signature_data_url: string;
  sender_position?: string;
  note?: string;
}

export interface ConfirmReceiveDeliveryNotePayload {
  signature_data_url: string;
  recipient_position?: string;
  note?: string;
  items: Array<{
    id: string;
    qty_received: number;
    condition_status: DeliveryItemCondition;
    notes?: string;
  }>;
}

export const warehouseApi = {
  async createWarehouseLocation(
    actor: ActorHeaders,
    payload: SaveWarehouseLocationPayload
  ): Promise<{ state: PMSState; warehouse: WarehouseLocation }> {
    const res = await apiFetch('/api/warehouse/locations', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateWarehouseLocation(
    actor: ActorHeaders,
    warehouseId: string,
    payload: SaveWarehouseLocationPayload
  ): Promise<{ state: PMSState; warehouse: WarehouseLocation }> {
    const res = await apiFetch(`/api/warehouse/locations/${encodeURIComponent(warehouseId)}`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createMaterial(
    actor: ActorHeaders,
    payload: CreateWarehouseMaterialPayload
  ): Promise<{ state: PMSState; material: Material }> {
    const res = await apiFetch('/api/warehouse/materials', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateMaterial(
    actor: ActorHeaders,
    materialId: string,
    payload: UpdateWarehouseMaterialPayload
  ): Promise<{ state: PMSState; material: Material }> {
    const res = await apiFetch(`/api/warehouse/materials/${encodeURIComponent(materialId)}`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createStockOrder(
    actor: ActorHeaders,
    payload: CreateStockOrderPayload
  ): Promise<{ state: PMSState; order: WarehouseStockOrder }> {
    const res = await apiFetch('/api/warehouse/orders', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async decideStockOrderFinance(
    actor: ActorHeaders,
    orderId: string,
    payload: DecideStockOrderFinancePayload
  ): Promise<{ state: PMSState; order: WarehouseStockOrder }> {
    const res = await apiFetch(`/api/warehouse/orders/${encodeURIComponent(orderId)}/decide-finance`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async confirmStockOrderReceipt(
    actor: ActorHeaders,
    orderId: string,
    payload: ConfirmStockOrderReceiptPayload
  ): Promise<{ state: PMSState; order: WarehouseStockOrder; transaction: MaterialTransaction }> {
    const res = await apiFetch(`/api/warehouse/orders/${encodeURIComponent(orderId)}/confirm-receipt`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async issueStock(
    actor: ActorHeaders,
    payload: IssueWarehouseStockPayload
  ): Promise<{ state: PMSState; transaction: MaterialTransaction }> {
    const res = await apiFetch('/api/warehouse/issue', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createMaterialRequest(
    actor: ActorHeaders,
    payload: CreateWarehouseMaterialRequestPayload
  ): Promise<{ state: PMSState; request: MaterialRequest }> {
    const res = await apiFetch('/api/warehouse/material-requests', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async advanceMaterialRequest(
    actor: ActorHeaders,
    requestId: string,
    payload: AdvanceWarehouseMaterialRequestPayload
  ): Promise<{ state: PMSState; request: MaterialRequest }> {
    const res = await apiFetch(
      `/api/warehouse/material-requests/${encodeURIComponent(requestId)}/advance`,
      {
        method: 'POST',
        headers: buildHeaders(actor),
        body: JSON.stringify(payload),
      }
    );
    return parseJson(res);
  },

  async createStockOpname(
    actor: ActorHeaders,
    payload: CreateStockOpnamePayload
  ): Promise<{ state: PMSState; opname: StockOpnameRecord }> {
    const res = await apiFetch('/api/warehouse/opname', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async createDeliveryNote(
    actor: ActorHeaders,
    payload: SaveDeliveryNotePayload
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch('/api/warehouse/delivery-notes', {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async updateDeliveryNote(
    actor: ActorHeaders,
    id: string,
    payload: SaveDeliveryNotePayload
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async prepareDeliveryNote(
    actor: ActorHeaders,
    id: string,
    note?: string
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/prepare`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ note }),
    });
    return parseJson(res);
  },

  async dispatchDeliveryNote(
    actor: ActorHeaders,
    id: string,
    payload: DispatchDeliveryNotePayload
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/dispatch`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  async markDeliveryNoteArrived(
    actor: ActorHeaders,
    id: string,
    note?: string
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/arrive`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ note }),
    });
    return parseJson(res);
  },

  async confirmReceiveDeliveryNote(
    actor: ActorHeaders,
    id: string,
    payload: ConfirmReceiveDeliveryNotePayload
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(
      `/api/warehouse/delivery-notes/${encodeURIComponent(id)}/confirm-receive`,
      {
        method: 'POST',
        headers: buildHeaders(actor),
        body: JSON.stringify(payload),
      }
    );
    return parseJson(res);
  },

  async cancelDeliveryNote(
    actor: ActorHeaders,
    id: string,
    reason: string
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async reviseDeliveryNote(
    actor: ActorHeaders,
    id: string,
    reason: string
  ): Promise<{ state: PMSState; deliveryNote: DeliveryNote; previousDeliveryNote: DeliveryNote }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/revise`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },

  async deleteDeliveryNote(
    actor: ActorHeaders,
    id: string,
    reason: string
  ): Promise<{ state: PMSState; deletedDeliveryNote: DeliveryNote; message?: string }> {
    const res = await apiFetch(`/api/warehouse/delivery-notes/${encodeURIComponent(id)}/delete`, {
      method: 'POST',
      headers: buildHeaders(actor),
      body: JSON.stringify({ reason }),
    });
    return parseJson(res);
  },
};
