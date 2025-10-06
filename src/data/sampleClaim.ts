export const SAMPLE_CLAIMS = [
  {
    label: "MRI Knee – missing insurance ID",
    data: {
      patientName: "John Doe",
      dob: "01/01/1975",
      insuranceId: "",
      procedure: "MRI Knee",
      cptCode: "73721",
    },
  },
  {
    label: "Brain MRI – unknown CPT",
    data: {
      patientName: "Jane Smith",
      dob: "1982-07-12",
      insuranceId: "A123456789",
      procedure: "MRI Brain",
      cptCode: "",
    },
  },
  {
    label: "Lumbar Spine MRI – complete",
    data: {
      patientName: "Aaron Lee",
      dob: "1979-11-02",
      insuranceId: "ZX-991144",
      procedure: "MRI Lumbar Spine",
      cptCode: "72148",
    },
  },
] as const;
