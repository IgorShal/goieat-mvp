from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MVP Mock API", version="0.1.0")

origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Venue(BaseModel):
    id: int
    name: str
    city: str
    description: str
    lat: float
    lng: float
    deal: str


class Product(BaseModel):
    id: int
    venue_id: int
    name: str
    price: float
    description: str
    image: str


class OrderItem(BaseModel):
    product_id: int
    qty: int


class Order(BaseModel):
    id: int
    venue_id: int
    items: List[OrderItem]
    status: str
    total: float
    qr_code: str
    created_at: datetime


venues: List[Venue] = []

products: List[Product] = []

orders: List[Order] = []
order_seq = 1


class CreateOrderRequest(BaseModel):
    venue_id: int
    items: List[OrderItem]
    customer: Optional[str] = "Гость"


class PartnerProductPayload(BaseModel):
    name: str
    price: float
    description: str
    image: str
    venue_id: Optional[int] = None


class PartnerVenuePayload(BaseModel):
    name: str
    city: str
    description: str
    lat: float
    lng: float
    deal: str


@app.get("/api/venues", response_model=List[Venue])
def list_venues():
    return venues


@app.get("/api/venues/{venue_id}/products", response_model=List[Product])
def list_products(venue_id: int):
    return [p for p in products if p.venue_id == venue_id]


@app.post("/api/orders")
def create_order(payload: CreateOrderRequest):
    global order_seq
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    if payload.venue_id not in [v.id for v in venues]:
        raise HTTPException(status_code=404, detail="Venue not found")

    total = 0.0
    for item in payload.items:
        prod = next((p for p in products if p.id == item.product_id), None)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        total += prod.price * item.qty

    order = Order(
        id=order_seq,
        venue_id=payload.venue_id,
        items=payload.items,
        status="paid",
        total=round(total, 2),
        qr_code=f"ORDER-{order_seq}",
        created_at=datetime.utcnow(),
    )
    orders.append(order)
    order_seq += 1
    return order


@app.get("/api/orders/{order_id}", response_model=Order)
def get_order(order_id: int):
    order = next((o for o in orders if o.id == order_id), None)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.patch("/api/orders/{order_id}/status")
def update_order_status(order_id: int, status: str):
    order = next((o for o in orders if o.id == order_id), None)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = status
    return {"ok": True, "status": status}


@app.get("/api/partner/orders", response_model=List[Order])
def partner_orders():
    return sorted(orders, key=lambda o: o.created_at, reverse=True)


@app.get("/api/partner/products", response_model=List[Product])
def partner_products():
    return products


@app.post("/api/partner/venues", response_model=Venue)
def create_venue(payload: PartnerVenuePayload):
    new_id = max([v.id for v in venues] + [0]) + 1
    venue = Venue(
        id=new_id,
        name=payload.name,
        city=payload.city,
        description=payload.description,
        lat=payload.lat,
        lng=payload.lng,
        deal=payload.deal,
    )
    venues.append(venue)
    return venue


@app.post("/api/partner/products", response_model=Product)
def create_product(payload: PartnerProductPayload):
    new_id = max([p.id for p in products] + [0]) + 1
    venue_id = payload.venue_id or venues[0].id
    product = Product(
        id=new_id,
        venue_id=venue_id,
        name=payload.name,
        price=payload.price,
        description=payload.description,
        image=payload.image,
    )
    products.append(product)
    return product


@app.put("/api/partner/products/{product_id}", response_model=Product)
def update_product(product_id: int, payload: PartnerProductPayload):
    product = next((p for p in products if p.id == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.name = payload.name
    product.price = payload.price
    product.description = payload.description
    product.image = payload.image
    if payload.venue_id:
        product.venue_id = payload.venue_id
    return product


@app.delete("/api/partner/products/{product_id}")
def delete_product(product_id: int):
    global products
    if not any(p.id == product_id for p in products):
        raise HTTPException(status_code=404, detail="Product not found")
    products = [p for p in products if p.id != product_id]
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok"}

