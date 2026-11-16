import React from 'react'
import { CheckCircle2, AlertTriangle, Sparkles, X, Camera, ShieldCheck } from 'lucide-react'

export interface QualityAnalysisResult {
  valid: boolean
  score: number
  rating: string
  status_color: string
  laplacian_variance: number
  mean_brightness: number
  resolution: string
  issues: string[]
  suggestions: string[]
  passed_checks: string[]
  suitable_for_matching: boolean
}

interface PhotoQualityModalProps {
  analysis: QualityAnalysisResult | null
  imagePreview: string
  isOpen: boolean
  onClose: () => void
  onAccept: () => void
  onRetake: () => void
}

export const PhotoQualityModal: React.FC<PhotoQualityModalProps> = ({
  analysis,
  imagePreview,
  isOpen,
  onClose,
  onAccept,
  onRetake,
}) => {
  if (!isOpen || !analysis) return null

  const isExcellent = analysis.score >= 80
  const isGood = analysis.score >= 55 && analysis.score < 80

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">AI Photo Quality Analysis</h3>
            <p className="text-xs text-slate-500">Checking clarity, lighting, and resolution for optimal AI matching</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <div className="col-span-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img src={imagePreview} alt="Uploaded pet preview" className="h-32 w-full object-cover" />
          </div>

          <div className="col-span-2 flex flex-col justify-center rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">AI Quality Score</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isExcellent
                    ? 'bg-emerald-100 text-emerald-800'
                    : isGood
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {analysis.rating}
              </span>
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {analysis.score}<span className="text-lg font-normal text-slate-400">/100</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full transition-all duration-500 ${
                  isExcellent ? 'bg-emerald-600' : isGood ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${analysis.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
            <p className="text-slate-400 font-medium">Sharpness</p>
            <p className="mt-1 font-bold text-slate-800">{analysis.laplacian_variance} / 100</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
            <p className="text-slate-400 font-medium">Exposure</p>
            <p className="mt-1 font-bold text-slate-800">{analysis.mean_brightness} lux</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
            <p className="text-slate-400 font-medium">Resolution</p>
            <p className="mt-1 font-bold text-slate-800">{analysis.resolution}</p>
          </div>
        </div>

        {/* Checks Feedback */}
        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1">
          {analysis.passed_checks.map((chk, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{chk}</span>
            </div>
          ))}
          {analysis.issues.map((iss, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold">{iss}</p>
                {analysis.suggestions[i] && <p className="text-slate-500 mt-0.5">{analysis.suggestions[i]}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={onRetake}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Camera className="h-3.5 w-3.5" /> Choose Sharper Photo
          </button>
          <button
            onClick={onAccept}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-800"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Use This Photo
          </button>
        </div>
      </div>
    </div>
  )
}
