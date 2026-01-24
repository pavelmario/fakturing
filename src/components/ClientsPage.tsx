import { useState } from "react";
import { useEvolu } from "../evolu";

export function ClientsPage() {
  const evolu = useEvolu();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [companyIdentificationNumber, setCompanyIdentificationNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const handleSave = async () => {
    setSaveMessage(null);

    if (!name.trim()) {
      alert("Please enter a client name");
      return;
    }

    setIsSaving(true);
    try {
      const result = evolu.insert("client", {
        name: name.trim(),
        email: toNullable(email),
        phone: toNullable(phone),
        addressLine1: toNullable(addressLine1),
        addressLine2: toNullable(addressLine2),
        companyIdentificationNumber: toNullable(companyIdentificationNumber),
        vatNumber: toNullable(vatNumber),
        note: toNullable(note),
      });

      if (!result.ok) {
        console.error("Validation error:", result.error);
        alert("Validation error while saving client");
        return;
      }

      setSaveMessage("Client saved successfully!");
      setName("");
      setEmail("");
      setPhone("");
      setAddressLine1("");
      setAddressLine2("");
      setCompanyIdentificationNumber("");
      setVatNumber("");
      setNote("");
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Error saving client");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Client</h1>

          {saveMessage ? (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              {saveMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-2">
                Client Name *
              </label>
              <input
                id="clientName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Contact E-mail
                </label>
                <input
                  id="clientEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="clientPhone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clientAddress1" className="block text-sm font-medium text-gray-700 mb-2">
                Address Line 1
              </label>
              <input
                id="clientAddress1"
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Street address"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="clientAddress2" className="block text-sm font-medium text-gray-700 mb-2">
                Address Line 2
              </label>
              <input
                id="clientAddress2"
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="City, state, postal code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="clientCompanyId" className="block text-sm font-medium text-gray-700 mb-2">
                  Company Identification Number
                </label>
                <input
                  id="clientCompanyId"
                  type="text"
                  value={companyIdentificationNumber}
                  onChange={(e) => setCompanyIdentificationNumber(e.target.value)}
                  placeholder="Company ID"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="clientVat" className="block text-sm font-medium text-gray-700 mb-2">
                  VAT Number
                </label>
                <input
                  id="clientVat"
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  placeholder="VAT Number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clientNote" className="block text-sm font-medium text-gray-700 mb-2">
                Note
              </label>
              <textarea
                id="clientNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Additional details about the client"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className={`mt-6 w-full font-semibold py-3 px-4 rounded-lg transition ${
              isSaving || !name.trim()
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isSaving ? "Saving..." : "Save Client"}
          </button>
        </div>
      </div>
    </div>
  );
}
